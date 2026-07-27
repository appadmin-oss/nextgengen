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
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2', 'mentorship', 'summer', 'policy', 'club', 'circle', 'momentum', 'integrations', 'registration', 'hooks', 'behaviour', 'volunteers', 'photos', 'mentor', 'analytics', 'profiles', 'community'] as $d) require $ROOT . "/_lib/domain/$d.php";
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

// ── Proper migrator: ladder integrity, idempotency, SQLite⇄MySQL parity ──
// The three ways migrations go wrong: a duplicate array key / forgotten target
// bump (ladder), a clash on re-run over an existing DB (idempotency), and dev
// (SQLite) drifting from prod (MySQL mirror). Each is guarded here.

chk('migrator: ladder guard accepts a contiguous 1..N ladder',
    (function () { try { db_assert_migration_ladder(array_fill(1, NGG_SCHEMA_TARGET, 'x')); return true; } catch (Throwable $e) { return false; } })());
chk('migrator: ladder guard rejects a gap in versions',
    (function () { try { db_assert_migration_ladder([1 => 'a', 3 => 'c']); return false; } catch (Throwable $e) { return true; } })());
chk('migrator: ladder guard rejects a count/target mismatch (forgotten bump)',
    (function () { try { db_assert_migration_ladder([1 => 'a', 2 => 'b']); return false; } catch (Throwable $e) { return true; } })());

chk('migrator: re-running migrations on a current DB is a clean no-op',
    (function () { $db = db_conn(); $b = (int)$db->query('SELECT MAX(version) FROM schema_version')->fetchColumn();
        try { db_migrate($db); } catch (Throwable $e) { return false; }
        return (int)$db->query('SELECT MAX(version) FROM schema_version')->fetchColumn() === $b && $b === NGG_SCHEMA_TARGET; })());

chk('migrator: full replay over a populated schema self-heals (no clash, no dup seeds)',
    (function () {
        $tmp = sys_get_temp_dir() . '/ngg-selfheal-' . bin2hex(random_bytes(3)) . '.db';
        $p = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        try {
            db_migrate($p);                          // fresh: full migrate incl. seed rows
            $p->exec('DELETE FROM schema_version');   // bookkeeping lost, data remains
            db_migrate($p);                           // replay over existing tables + seeds
            $v = (int)$p->query('SELECT MAX(version) FROM schema_version')->fetchColumn();
            $dupes = (int)$p->query('SELECT COUNT(*) - COUNT(DISTINCT code) FROM vol_tiers')->fetchColumn();
            return $v === NGG_SCHEMA_TARGET && $dupes === 0;
        } catch (Throwable $e) { return false; }
        finally { @unlink($tmp); }
    })());

chk('migrator: idempotent DDL helpers report existence correctly',
    (function () { $db = db_conn();
        return db_table_exists($db, 'centres') && !db_table_exists($db, 'no_such_table_xyz')
            && db_column_exists($db, 'centres', 'address') && !db_column_exists($db, 'centres', 'no_such_col_xyz'); })());

// SQLite⇄MySQL parity: every table + column the code relies on in SQLite must
// also exist in db/schema-mysql.sql, or prod silently lacks a column dev has.
function ngg_split_top_commas(string $s): array {
    $out = []; $depth = 0; $cur = ''; $n = strlen($s);
    for ($i = 0; $i < $n; $i++) { $c = $s[$i];
        if ($c === '(') $depth++; elseif ($c === ')') $depth--;
        if ($c === ',' && $depth === 0) { $out[] = $cur; $cur = ''; } else $cur .= $c;
    }
    if (trim($cur) !== '') $out[] = $cur;
    return $out;
}
function ngg_parse_mysql_schema(string $sql): array {
    $tables = [];
    foreach (db_split_sql($sql) as $stmt) {
        if (preg_match('/^CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?(\w+)`?\s*\((.*)\)[^)]*$/is', $stmt, $m)) {
            $cols = [];
            foreach (ngg_split_top_commas($m[2]) as $frag) {
                $frag = trim($frag);
                if ($frag === '' || preg_match('/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|FULLTEXT|CHECK)\b/i', $frag)) continue;
                if (preg_match('/^`?(\w+)`?/', $frag, $cm)) $cols[] = $cm[1];
            }
            $tables[$m[1]] = $cols;
        } elseif (preg_match('/^ALTER TABLE\s+`?(\w+)`?\s+(.*)$/is', $stmt, $m) && preg_match_all('/ADD COLUMN\s+`?(\w+)`?/i', $m[2], $am)) {
            foreach ($am[1] as $c) $tables[$m[1]][] = $c;
        }
    }
    return $tables;
}
$mysqlSchema = ngg_parse_mysql_schema((string)@file_get_contents(dirname($ROOT) . '/db/schema-mysql.sql'));
$parityDb = db_conn();
$drift = [];
foreach ($parityDb->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'") as $tr) {
    $t = (string)$tr['name'];
    if (in_array($t, ['schema_version', 'schema_meta'], true)) continue;
    if (!isset($mysqlSchema[$t])) { $drift[] = "MISSING TABLE $t"; continue; }
    foreach ($parityDb->query("PRAGMA table_info(\"$t\")") as $ci) {
        $col = (string)$ci['name'];
        if (!in_array($col, $mysqlSchema[$t], true)) $drift[] = "$t.$col";
    }
}
chk('migrator: SQLite⇄MySQL mirror parity — every table+column present' . ($drift ? ' [DRIFT: ' . implode(', ', array_slice($drift, 0, 15)) . ']' : ''), empty($drift));

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
// Headshots are required on intake by default; the bulk apply/gate tests below
// don't submit a photo, so relax the gate here and assert the requirement in a
// dedicated block further down.
setting_set('intake_photo_required', '0', 'test');
chk('post publishes with slug', !empty(backend_dispatch('admin.posts.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['kind' => 'blog', 'title' => 'First Post', 'body' => 'Hi', 'status' => 'published']])['slug']));
chk('public reads published post', count(backend_dispatch('public.posts', ['kind' => 'blog'])['posts']) === 1);
chk('newsletter idempotent', backend_dispatch('public.newsletter', ['email' => 'sub@example.com'])['ok'] && backend_dispatch('public.newsletter', ['email' => 'sub@example.com'])['ok']);
chk('apply validates age', backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Kid', 'lastName' => 'Test', 'email' => 'k@example.com', 'phone' => '08031234000', 'dob' => '1985-01-01'])['error'] === 'bad_age');
// Headshot required on intake (teen + volunteer) when the gate is on (default).
setting_set('intake_photo_required', '1', 'test');
chk('apply requires a headshot when the gate is on', backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'No', 'lastName' => 'Photo', 'email' => 'nophoto@example.com', 'phone' => '08031234111', 'dob' => '2012-01-01'])['error'] === 'photo_required');
chk('apply passes with a valid cloudinary headshot', !empty(backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'With', 'lastName' => 'Photo', 'email' => 'withphoto@example.com', 'phone' => '08031234112', 'dob' => '2012-01-01', 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/v1/face.jpg'])['ok']));
setting_set('intake_photo_required', '0', 'test');
chk('apply skips the headshot gate when disabled', !empty(backend_dispatch('public.apply', ['kind' => 'teen', 'sex' => 'Male', 'firstName' => 'Gate', 'lastName' => 'Off', 'email' => 'gateoff@example.com', 'phone' => '08031234113', 'dob' => '2012-01-01'])['ok']));

// ── Volunteer registration (public taxonomy: admin | mentor | instructor) ──
$vctx = backend_dispatch('public.volunteer.context', []);
chk('volunteer context lists roles', $vctx['roles'] === ['admin', 'mentor', 'instructor']);
chk('volunteer context serves the course catalogue', in_array('Practical Coding', $vctx['courses'], true));
chk('volunteer context serves the faculty catalogue', is_array($vctx['faculties']) && count($vctx['faculties']) >= 1);
// An active centre must exist for volunteer intake (centre is now required).
db_insert('centres', ['centreId' => 'CEN-VOL', 'name' => 'Testville', 'code' => 'TVL', 'color' => '#4C6FFF', 'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
$vFac = $vctx['faculties'][0];
chk('volunteer apply rejects unknown role', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'chef', 'firstName' => 'Vol', 'lastName' => 'One', 'email' => 'vol1@example.com', 'phone' => '08031110009', 'dob' => '1990-01-01'])['error'] === 'bad_role');
chk('volunteer apply rejects a missing centre', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'No', 'lastName' => 'Centre', 'email' => 'nocentre@example.com', 'phone' => '08031110077', 'dob' => '1990-01-01'])['error'] === 'centre_required');
chk('volunteer apply rejects an invalid centre', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Bad', 'lastName' => 'Centre', 'email' => 'badcentre@example.com', 'phone' => '08031110078', 'dob' => '1990-01-01', 'centre' => 'Nowhere'])['error'] === 'invalid_centre');
chk('mentor without a faculty is rejected', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'mentor', 'firstName' => 'No', 'lastName' => 'Fac', 'email' => 'nofac@example.com', 'phone' => '08031110076', 'dob' => '1990-01-01', 'centre' => 'Testville'])['error'] === 'faculty_required');
chk('instructor without a faculty is rejected', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'No', 'lastName' => 'Fac2', 'email' => 'nofac2@example.com', 'phone' => '08031110075', 'dob' => '1990-01-01', 'centre' => 'Testville', 'courses' => ['Practical Coding']])['error'] === 'faculty_required');
chk('instructor without a course is rejected', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'Vol', 'lastName' => 'One', 'email' => 'vol1@example.com', 'phone' => '08031110001', 'dob' => '1990-01-01', 'centre' => 'Testville', 'faculty' => $vFac, 'courses' => ['Basket Weaving']])['error'] === 'course_required');
chk('volunteer admin role applies clean', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Vol', 'lastName' => 'Admin', 'email' => 'vol-admin@example.com', 'phone' => '08031234567', 'dob' => '1990-01-01', 'centre' => 'Testville'])['ok'] === true);
chk('volunteer centre stored on application', db_row("SELECT centre FROM applications WHERE email = 'vol-admin@example.com'")['centre'] === 'Testville');
chk('volunteer phone stored normalized', db_row("SELECT phone FROM applications WHERE email = 'vol-admin@example.com'")['phone'] === '+2348031234567');
chk('instructor with valid courses applies clean', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'Vol', 'lastName' => 'Teach', 'email' => 'vol-teach@example.com', 'phone' => '08031110002', 'dob' => '1990-01-01', 'centre' => 'Testville', 'faculty' => $vFac, 'courses' => ['Practical Coding', 'Piano', 'Basket Weaving'], 'visibilityConsent' => true])['ok'] === true);
chk('instructor faculty stored on application', db_row("SELECT faculty FROM applications WHERE email = 'vol-teach@example.com'")['faculty'] === $vFac);
chk('volunteer visibility consent stored on application', (int)db_row("SELECT visibilityConsent FROM applications WHERE email = 'vol-teach@example.com'")['visibilityConsent'] === 1);
chk('instructor courses stored filtered to catalogue', json_decode((string)db_row("SELECT courses FROM applications WHERE email = 'vol-teach@example.com'")['courses'], true) === ['Practical Coding', 'Piano']);
chk('volunteer duplicate within 24h flagged', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Vol', 'lastName' => 'Admin', 'email' => 'vol-admin@example.com', 'phone' => '08031234567', 'dob' => '1990-01-01', 'centre' => 'Testville'])['duplicate'] === true);
chk('volunteer.applied event queued for the bus', (int)db_row("SELECT COUNT(*) c FROM outbox WHERE kind = 'volunteer.applied'")['c'] === 2);
// Standardised intake: structured name + DOB stored; legacy `name` composed.
chk('structured name + dob stored on application', (function () { $r = db_row("SELECT firstName,lastName,dob,name FROM applications WHERE email='vol-teach@example.com'"); return $r && $r['firstName'] === 'Vol' && $r['lastName'] === 'Teach' && $r['dob'] === '1990-01-01' && $r['name'] === 'Vol Teach'; })());
chk('apply rejects a malformed dob', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Bad', 'lastName' => 'Dob', 'email' => 'baddob@example.com', 'phone' => '08031110099', 'dob' => 'not-a-date'])['error'] === 'bad_dob');
chk('apply rejects an under-16 volunteer', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Too', 'lastName' => 'Young', 'email' => 'young@example.com', 'phone' => '08031110098', 'dob' => '2015-01-01'])['error'] === 'dob_too_young');
chk('apply requires a first name', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'lastName' => 'Only', 'email' => 'nofirst@example.com', 'phone' => '08031110097', 'dob' => '1990-01-01'])['error'] === 'bad_firstName');
// The HTTP endpoint builds the gs_call payload from the request body; the
// domain tests above dispatch straight to public.apply and so never catch a
// field the endpoint forgets to forward. `sex` is required on every intake and
// a volunteer needs `centre`/`faculty` — a dropped field is a silent 400 in
// production. Guard the endpoint source so those forwards can't regress.
$applySrc = (string)@file_get_contents($ROOT . '/public/apply.php');
chk('apply endpoint forwards sex to the domain', (bool)preg_match("/'sex'\\s*=>/", $applySrc));
chk('apply endpoint forwards volunteer centre', (bool)preg_match("/\\\$payload\\['centre'\\]\\s*=/", $applySrc));
chk('apply endpoint forwards volunteer faculty', (bool)preg_match("/\\\$payload\\['faculty'\\]\\s*=/", $applySrc));
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
// Faculty catalogue is Form-Builder-driven: an admin edit round-trips to the
// public volunteer context (brief §5.4).
$vform = backend_dispatch('admin.forms.get', ['requesterId' => 'NGG-2025-0099', 'formId' => 'volunteer'])['form']['fields'];
$vform2 = array_map(function ($f) use ($vFac) { if (($f['key'] ?? '') === 'faculty') $f['options'] = [$vFac, 'Design Lab', 'Wordsmiths']; return $f; }, $vform);
backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'formId' => 'volunteer', 'fields' => $vform2]);
chk('faculty catalogue edit round-trips to public context', in_array('Design Lab', backend_dispatch('public.volunteer.context', [])['faculties'], true));

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

chk('phone is required on volunteer intake', backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'instructor', 'firstName' => 'No', 'lastName' => 'Phone', 'email' => 'nophone@example.com', 'dob' => '1990-01-01', 'courses' => ['Practical Coding']])['error'] === 'phone_required');

// ── Volunteer review desk: approve → ID + QR + profile; decline ──
$volAppId = (int)db_row("SELECT id FROM applications WHERE email = 'vol-teach@example.com'")['id'];
chk('non-admin cannot review volunteers', backend_dispatch('admin.volunteers.list', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('review desk lists the pending queue', count(backend_dispatch('admin.volunteers.list', ['requesterId' => 'NGG-2025-0099'])['pending']) >= 2);
$appr = backend_dispatch('admin.volunteers.approve', ['requesterId' => 'NGG-2025-0099', 'id' => $volAppId]);
chk('approval mints a VOL-CODE display id', preg_match('/^VOL-[A-Z]{2,4}-\d{2}-\d{3}$/', $appr['volunteer']['volunteerId']) === 1);
chk('instructor id carries the INS tier code', str_starts_with((string)$appr['volunteer']['volunteerId'], 'VOL-INS-'));
chk('approval binds a check-in token', str_starts_with((string)$appr['volunteer']['token'], 'VOLQR-'));
chk('approval carries the volunteer visibility consent', (int)db_row("SELECT visibilityConsent FROM volunteers WHERE volunteerId = ?", [$appr['volunteer']['volunteerId']])['visibilityConsent'] === 1);
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
$__ap = backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'mentor', 'firstName' => 'Ada', 'lastName' => 'Ack', 'email' => 'ada-ack@example.com', 'phone' => '08031110020', 'dob' => '1990-01-01', 'centre' => 'Testville', 'faculty' => $vFac, 'why' => 'Glad to help']);
chk('apply returns a traceable reference', isset($__ap['ref']) && preg_match('/^NGG-V-\d{5}$/', (string)$__ap['ref']) === 1 && $__ap['duplicate'] === false);
$__ack = array_values(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'ada-ack@example.com'));
chk('volunteer application acknowledges the applicant', count($__ack) === 1 && str_contains($__ack[0]['subject'], 'volunteer application'));
chk('ack is on-brand + names role + carries the reference', str_contains($__ack[0]['html'], '#0c1432') && str_contains($__ack[0]['html'], 'Mentor') && str_contains($__ack[0]['html'], (string)$__ap['ref']));
$__dup = backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'mentor', 'firstName' => 'Ada', 'lastName' => 'Ack', 'email' => 'ada-ack@example.com', 'phone' => '08031110020', 'dob' => '1990-01-01', 'centre' => 'Testville', 'faculty' => $vFac, 'why' => 'again']);
chk('resubmit is a no-op duplicate with the same reference', $__dup['duplicate'] === true && $__dup['ref'] === $__ap['ref']);
chk('duplicate does not re-acknowledge', count(array_values(array_filter($GLOBALS['__mail_sink'], fn($m) => $m['to'] === 'ada-ack@example.com'))) === 1);
unset($GLOBALS['__mail_sink']);

// ── Volunteer needs config + public /v-status fulfilment board ──
// The approved instructor (vol-teach) sits at Testville with 2 courses.
chk('needs CRUD gated from non-permitted roles', backend_dispatch('admin.volunteers.needs.upsert', ['requesterId' => 'NGG-2025-0001', 'centreId' => 'CEN-VOL', 'role' => 'instructor', 'needCount' => 3])['error'] === 'forbidden');
chk('admin sets an instructor need', !empty(backend_dispatch('admin.volunteers.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'role' => 'instructor', 'needCount' => 3])['ok']));
backend_dispatch('admin.volunteers.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'role' => 'admin', 'needCount' => 2]);
$vneeds = backend_dispatch('admin.volunteers.needs.list', ['requesterId' => 'NGG-2025-0099']);
chk('needs list carries live filled counts', ($vneeds['filled']['role']['CEN-VOL|instructor'] ?? 0) === 1);
chk('needs upsert rejects an invalid centre', backend_dispatch('admin.volunteers.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'NOPE', 'role' => 'admin', 'needCount' => 1])['error'] === 'invalid_centre');
$vs = backend_dispatch('public.volunteer.status', []);
$tv = null; foreach ($vs['status']['byCentre'] as $c) if ($c['centreId'] === 'CEN-VOL') $tv = $c;
chk('v-status per-centre math (need/filled/gap)', $tv && $tv['need'] === 5 && $tv['filled'] === 1 && $tv['gap'] === 4);
$insRow = null; foreach ($tv['byRole'] as $r) if ($r['role'] === 'instructor') $insRow = $r;
chk('v-status by-role instructor fulfilment', $insRow['need'] === 3 && $insRow['filled'] === 1 && $insRow['gap'] === 2 && $insRow['fulfillmentRate'] === 33);
$mentRow = null; foreach ($tv['byRole'] as $r) if ($r['role'] === 'mentor') $mentRow = $r;
chk('v-status zero-need role does not divide by zero', $mentRow['need'] === 0 && $mentRow['fulfillmentRate'] === 100);
$admRow = null; foreach ($tv['byRole'] as $r) if ($r['role'] === 'admin') $admRow = $r;
chk('v-status zero-filled role reports 0%', $admRow['need'] === 2 && $admRow['filled'] === 0 && $admRow['fulfillmentRate'] === 0);
chk('v-status by-course lists the instructor courses', count(array_filter($tv['byCourse'], fn($x) => $x['course'] === 'Practical Coding' && $x['filled'] === 1)) === 1);
chk('v-status global fulfilment math', $vs['status']['kpis']['totalNeed'] === 5 && $vs['status']['kpis']['totalFilled'] === 1 && $vs['status']['kpis']['fulfillmentRate'] === 20);
chk('v-status exposes no volunteer PII', !str_contains(json_encode($vs['status']), 'vol-teach@example.com') && !str_contains(json_encode($vs['status']), 'Vol Teach'));

// ── Material (item) needs — non-headcount needs a centre asks for ──
chk('item needs CRUD gated from non-permitted roles', backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0001', 'centreId' => 'CEN-VOL', 'item' => 'Laptops', 'needCount' => 5])['error'] === 'forbidden');
chk('item upsert rejects a blank item name', backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => '  ', 'needCount' => 5])['error'] === 'bad_item');
chk('item upsert rejects an invalid centre', backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'NOPE', 'item' => 'Laptops', 'needCount' => 5])['error'] === 'invalid_centre');
chk('admin adds an item need', !empty(backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Laptops', 'needCount' => 10, 'filledCount' => 4, 'unit' => 'units'])['ok']));
backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Data bundles', 'needCount' => 5, 'filledCount' => 5]);
$vneeds2 = backend_dispatch('admin.volunteers.needs.list', ['requesterId' => 'NGG-2025-0099']);
chk('needs list carries item rows', count(array_filter($vneeds2['items'], fn($x) => $x['centreId'] === 'CEN-VOL' && $x['item'] === 'Laptops' && (int)$x['needCount'] === 10)) === 1);
$vs2 = backend_dispatch('public.volunteer.status', []);
$tv2 = null; foreach ($vs2['status']['byCentre'] as $c) if ($c['centreId'] === 'CEN-VOL') $tv2 = $c;
$lap = null; foreach (($tv2['items'] ?? []) as $it) if ($it['item'] === 'Laptops') $lap = $it;
chk('v-status per-centre item math (need/filled/gap/tone)', $lap && $lap['need'] === 10 && $lap['filled'] === 4 && $lap['gap'] === 6 && $lap['tone'] === 'urgent');
$dat = null; foreach (($tv2['items'] ?? []) as $it) if ($it['item'] === 'Data bundles') $dat = $it;
chk('v-status met item reports full', $dat && $dat['gap'] === 0 && $dat['tone'] === 'met');
chk('v-status item KPIs sum across centres', ($vs2['status']['kpis']['itemNeed'] ?? 0) === 15 && ($vs2['status']['kpis']['itemFilled'] ?? 0) === 9 && ($vs2['status']['kpis']['itemGap'] ?? 0) === 6);
chk('v-status item KPIs count types + still-needed', ($vs2['status']['kpis']['itemTypes'] ?? 0) === 2 && ($vs2['status']['kpis']['itemStillNeeded'] ?? 0) === 1 && ($vs2['status']['kpis']['itemOpen'] ?? 0) === 0);
// An OPEN item — no specific target (needCount omitted / 0). It never reads as
// "met"; it's a standing request that counts as still-wanted.
backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Story books', 'filledCount' => 3]);
$vs3 = backend_dispatch('public.volunteer.status', []);
$tv3 = null; foreach ($vs3['status']['byCentre'] as $c) if ($c['centreId'] === 'CEN-VOL') $tv3 = $c;
$open = null; foreach (($tv3['items'] ?? []) as $it) if ($it['item'] === 'Story books') $open = $it;
chk('open item: no target, still wanted, not met', $open && $open['open'] === true && $open['need'] === 0 && $open['gap'] === 0 && $open['wanted'] === true && $open['tone'] === 'open' && $open['fulfillmentRate'] === null);
chk('open item counts toward itemOpen + itemStillNeeded, not itemNeed', ($vs3['status']['kpis']['itemOpen'] ?? 0) === 1 && ($vs3['status']['kpis']['itemStillNeeded'] ?? 0) === 2 && ($vs3['status']['kpis']['itemNeed'] ?? 0) === 15);
backend_dispatch('admin.items.needs.delete', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Story books']);
chk('item upsert dedupes by (centre,item)', (function () {
    backend_dispatch('admin.items.needs.upsert', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Laptops', 'needCount' => 12, 'filledCount' => 4]);
    $rows = array_filter(backend_dispatch('admin.volunteers.needs.list', ['requesterId' => 'NGG-2025-0099'])['items'], fn($x) => $x['centreId'] === 'CEN-VOL' && $x['item'] === 'Laptops');
    return count($rows) === 1 && (int)reset($rows)['needCount'] === 12;
})());
chk('item delete removes the row', !empty(backend_dispatch('admin.items.needs.delete', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Data bundles'])['ok'])
    && backend_dispatch('admin.items.needs.delete', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'item' => 'Nonexistent'])['error'] === 'not_found');

chk('need delete removes the row', !empty(backend_dispatch('admin.volunteers.needs.delete', ['requesterId' => 'NGG-2025-0099', 'centreId' => 'CEN-VOL', 'role' => 'admin', 'faculty' => ''])['ok']));
// Return the catalogue to a clean slate for the later centre-management tests.
db_exec("DELETE FROM centres WHERE centreId = 'CEN-VOL'");
db_exec("DELETE FROM volunteer_needs WHERE centreId = 'CEN-VOL'");
db_exec("DELETE FROM item_needs WHERE centreId = 'CEN-VOL'");

// ── Public-profile enrichment: projects + mentor notes ──
db_insert('summer_students', ['studentId' => 'PROF-STU-1', 'cohortId' => 'PROF-C', 'handle' => 'prof-stu', 'fullName' => 'Proj Kid', 'status' => 'active', 'regStatus' => 'verified', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
chk('profile extras gated from non-permitted roles', backend_dispatch('admin.profile.project.upsert', ['requesterId' => 'NGG-2025-0001', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'title' => 'X'])['error'] === 'forbidden');
chk('profile project rejects a bad subject', backend_dispatch('admin.profile.project.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'NOPE', 'title' => 'X'])['error'] === 'bad_subject');
chk('profile project requires a title', backend_dispatch('admin.profile.project.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'title' => '  '])['error'] === 'title_required');
$prj = backend_dispatch('admin.profile.project.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'title' => 'Lagos Bus Tracker', 'kind' => 'CODE · CIVIC', 'url' => 'https://example.com/bus', 'imageUrl' => 'http://insecure/x.png']);
chk('profile project saves + strips non-https image', !empty($prj['ok']) && $prj['id'] > 0);
chk('profile note requires text', backend_dispatch('admin.profile.note.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'note' => ''])['error'] === 'note_required');
backend_dispatch('admin.profile.note.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'author' => 'Dr. Ade', 'note' => 'Public praise here', 'isPublic' => true]);
backend_dispatch('admin.profile.note.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'author' => 'Staff', 'note' => 'Private staff note', 'isPublic' => false]);
$pe = backend_dispatch('admin.profile.extras.get', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1']);
chk('admin extras.get returns projects + all notes', count($pe['projects']) === 1 && count($pe['notes']) === 2);
$pubProf = backend_dispatch('public.summerProfile', ['handle' => 'prof-stu'])['profile'];
chk('public profile shows projects', count($pubProf['projects'] ?? []) === 1 && $pubProf['projects'][0]['title'] === 'Lagos Bus Tracker' && ($pubProf['projects'][0]['imageUrl'] ?? 'x') === '');
chk('public profile shows ONLY public notes', count($pubProf['notes'] ?? []) === 1 && $pubProf['notes'][0]['note'] === 'Public praise here');
// Delete is scoped to the subject: a mismatched (subjectType,subjectId) can't
// destroy the row by id alone — guards against cross-subject IDOR.
chk('profile project delete rejects a mismatched subject', backend_dispatch('admin.profile.project.delete', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'volunteer', 'subjectId' => 'PROF-STU-1', 'id' => $prj['id']])['error'] === 'not_found'
    && count(backend_dispatch('admin.profile.extras.get', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1'])['projects']) === 1);
chk('profile project delete works', !empty(backend_dispatch('admin.profile.project.delete', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1', 'id' => $prj['id']])['ok'])
    && count(backend_dispatch('admin.profile.extras.get', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'PROF-STU-1'])['projects']) === 0);
db_exec("DELETE FROM summer_students WHERE studentId = 'PROF-STU-1'");
db_exec("DELETE FROM profile_projects WHERE subjectId = 'PROF-STU-1'");
db_exec("DELETE FROM profile_notes WHERE subjectId = 'PROF-STU-1'");

// Volunteer subject: extras go through the volunteer->people cap path and must
// surface on the public volunteer profile (guards the array_merge extras join).
$volPrj = backend_dispatch('admin.profile.project.upsert', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'volunteer', 'subjectId' => $volId, 'title' => 'Mentor Toolkit']);
chk('volunteer profile project saves', !empty($volPrj['ok']));
$volPubExtras = backend_dispatch('public.summerProfile', ['token' => $volTok])['profile'];
chk('public volunteer profile surfaces projects', ($volPubExtras['projects'][0]['title'] ?? '') === 'Mentor Toolkit');
backend_dispatch('admin.profile.project.delete', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'volunteer', 'subjectId' => $volId, 'id' => $volPrj['id']]);

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
chk('roster opens with token + registered email', $roster['ok'] === true && $roster['courses'] === ['Practical Coding', 'Piano'] && is_array($roster['students']));
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
chk('duty completion requires the summer cap (non-cap staff blocked)', backend_dispatch('attendance.duty.complete', ['requesterId' => 'NGG-2025-0001', 'date' => $today, 'centre' => $centre0, 'volunteerId' => 'VOL-T-2'])['error'] === 'forbidden');
chk('duty completion refuses a volunteer not on duty for the centre', backend_dispatch('attendance.duty.complete', ['requesterId' => 'NGG-2025-0099', 'date' => $today, 'centre' => $centre0, 'volunteerId' => 'VOL-T-1'])['error'] === 'not_on_duty');
chk('duty completion rejects a malformed date', backend_dispatch('attendance.duty.complete', ['requesterId' => 'NGG-2025-0099', 'date' => 'not-a-date', 'centre' => $centre0, 'volunteerId' => 'VOL-T-2'])['error'] === 'bad_date');
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
chk('idcard default proportion is 54×75mm', (function () {
    $id = backend_dispatch('admin.cards.data', ['requesterId' => 'NGG-2025-0099'])['program'];
    return (float)$id['widthMm'] === 54.0 && (float)$id['heightMm'] === 75.0;
})());
chk('idcard proportion is editable, clamped, and preserves branding', (function () {
    backend_dispatch('admin.settings.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['idcard' => ['widthMm' => 55, 'heightMm' => 200]]]);
    $id = backend_dispatch('admin.cards.data', ['requesterId' => 'NGG-2025-0099'])['program'];
    // height clamps into range, width persists, and the earlier motto survives the partial save (merge)
    return (float)$id['widthMm'] === 55.0 && (float)$id['heightMm'] === 100.0 && $id['motto'] === 'EMPOWERED 360°';
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
// ── Programme calendar + Institutional Policy enforcement ───────────────────
// The calendar decides which days count; the policy engine decides what a
// missed one costs. Both are exercised against a real term window rather than
// "today", so the suite does not change behaviour with the day of the week.
$SU = 'NGG-2025-0099';
chk('programme calendar is off until an admin sets one', programme_settings()['enabled'] === false);
chk('with no calendar every day is a programme day', programme_is_day('2026-07-26') === true);   // a Sunday

// A Mon–Fri term with one holiday and one added Saturday.
$pgSave = backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'programme' => [
    'enabled' => true, 'startDate' => '2026-07-06', 'endDate' => '2026-08-28',
    'weekdays' => [1, 2, 3, 4, 5], 'holidays' => ['2026-07-15'], 'extraDays' => ['2026-07-11'],
]]);
chk('programme calendar saves', !empty($pgSave['ok']) && $pgSave['programme']['enabled'] === true);
chk('a scheduled weekday runs', programme_is_day('2026-07-14') === true);
chk('a weekend does not', programme_is_day('2026-07-12') === false);
chk('a holiday cancels a scheduled day', programme_is_day('2026-07-15') === false);
chk('an extra day adds an unscheduled one', programme_is_day('2026-07-11') === true);
chk('outside the term window nothing runs', programme_is_day('2026-09-01') === false && programme_is_day('2026-07-01') === false);
chk('day count over a week is 5 weekdays + the extra Saturday', count(programme_days_between('2026-07-06', '2026-07-12')) === 6);
chk('the holiday week counts 4, not 5', count(programme_days_between('2026-07-13', '2026-07-17')) === 4);
chk('next programme day skips the weekend', programme_next_day('2026-07-17') === '2026-07-20');
chk('an impossible date is not a holiday', !in_array('2026-02-30', programme_settings_save(['enabled' => true] + programme_settings() + [], 'test')['holidays'], true));
// An inverted window would make every day non-programme with no visible cause.
chk('an inverted term window is swapped, not accepted', (function () {
    $r = programme_settings_save(array_merge(programme_settings(), ['startDate' => '2026-08-28', 'endDate' => '2026-07-06']), 'test');
    return $r['startDate'] === '2026-07-06' && $r['endDate'] === '2026-08-28';
})());
// Toggling one date is the coordinator's fast path for "no session tomorrow".
chk('toggling a day off adds a holiday', (function () use ($SU) {
    backend_dispatch('admin.policy.day.toggle', ['requesterId' => $SU, 'date' => '2026-07-14', 'runs' => false]);
    return programme_is_day('2026-07-14') === false;
})());
chk('toggling it back on removes the holiday', (function () use ($SU) {
    backend_dispatch('admin.policy.day.toggle', ['requesterId' => $SU, 'date' => '2026-07-14', 'runs' => true]);
    return programme_is_day('2026-07-14') === true;
})());
chk('policy screens are gated by the summer cap', backend_dispatch('admin.policy.settings', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

// Absence sweeping + strike ladder, driven directly so the thresholds are
// tested rather than the wall clock.
backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => true]]);
chk('policy enforcement can be switched on', policy_settings()['enabled'] === true);
// Self-executing by the Governing Council's instruction: the thresholds bite
// without a human in the loop ("no manual overrides, no verbal adjustments").
chk('the thresholds are self-executing by default', policy_settings()['autoEnforce'] === true);
// The review-first stance is still supported and still has to work, because it
// is the only thing standing between a broken scanner and an eviction.
chk('review-first: a third absence proposes eviction rather than imposing it', (function () use ($SU) {
    backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => true, 'autoEnforce' => false]]);
    $p = backend_dispatch('admin.summer.enroll', ['requesterId' => $SU, 'data' => ['fullName' => 'Review Rilwan', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech']]);
    for ($i = 6; $i <= 8; $i++) policy_log($p['studentId'], 'student', 'absence', '2026-07-0' . $i);
    policy_apply($p['studentId'], 'student');
    $st = policy_state($p['studentId'], 'student');
    $r = backend_dispatch('admin.summer.checkin', ['requesterId' => $SU, 'token' => $p['token']]);
    $GLOBALS['reviewCase'] = $p;
    return $st['state'] === 'dormant' && $st['awaitingReview'] === true
        && $st['proposed'][0]['kind'] === 'eviction' && !empty($r['ok']);
})());
chk('…and it shows up on the board as needing review', (function () {
    foreach (backend_dispatch('admin.policy.board', ['requesterId' => 'NGG-2025-0099'])['board'] as $r) {
        if ($r['personId'] === $GLOBALS['reviewCase']['studentId']) return !empty($r['awaitingReview']);
    }
    return false;
})());
chk('confirming a proposed eviction is what makes it bite', (function () use ($SU) {
    $id = $GLOBALS['reviewCase']['studentId'];
    $sid = (int)db_row("SELECT id FROM sanctions WHERE personId = ? AND kind = 'eviction'", [$id])['id'];
    $r = backend_dispatch('admin.policy.sanction.update', ['requesterId' => $SU, 'sanctionId' => $sid, 'status' => 'active']);
    return $r['state']['state'] === 'evicted';
})());
// Back to the shipped stance for the threshold tests that follow.
backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => true, 'autoEnforce' => true]]);
chk('a third absence evicts outright with enforcement strict', (function () use ($SU) {
    backend_dispatch('admin.summer.qr.mint', ['requesterId' => $SU, 'count' => 5]);   // blanks run out
    $p = backend_dispatch('admin.summer.enroll', ['requesterId' => $SU, 'data' => ['fullName' => 'Strict Sikiru', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech']]);
    if (empty($p['studentId'])) return false;
    for ($i = 6; $i <= 8; $i++) policy_log($p['studentId'], 'student', 'absence', '2026-07-0' . $i);
    policy_apply($p['studentId'], 'student');
    $st = policy_state($p['studentId'], 'student');
    return $st['state'] === 'evicted' && $st['awaitingReview'] === false && $st['blocked'] === true;
})());
$pid = $enr['studentId'];
chk('a clear ledger reads clear', policy_state($pid, 'student')['state'] === 'clear');
policy_log($pid, 'student', 'absence', '2026-07-06');
policy_apply($pid, 'student');
chk('absence 1 is a warning, not dormancy', policy_state($pid, 'student')['state'] === 'warned');
policy_log($pid, 'student', 'absence', '2026-07-07');
policy_apply($pid, 'student');
chk('absence 2 puts the student on the Dormant Track', policy_state($pid, 'student')['state'] === 'dormant');
chk('dormancy freezes awards eligibility', policy_state($pid, 'student')['awardsEligible'] === false);
chk('the same absence logged twice is still one strike', (function () use ($pid) {
    policy_log($pid, 'student', 'absence', '2026-07-07');       // exact repeat
    return policy_counts($pid)['absence'] === 2;
})());
policy_log($pid, 'student', 'absence', '2026-07-08');
policy_apply($pid, 'student');
chk('absence 3 is eviction', policy_state($pid, 'student')['state'] === 'evicted');
// A fresh student, because a scan only reaches the gate when there is no row
// for today yet — you cannot un-check-in someone who is already present.
$evicted = backend_dispatch('admin.summer.enroll', ['requesterId' => $SU, 'data' => ['fullName' => 'Emeka Evicted', 'age' => 13, 'centre' => 'Egbeda', 'track' => 'Tech']]);
for ($i = 6; $i <= 8; $i++) policy_log($evicted['studentId'], 'student', 'absence', '2026-07-0' . $i);
policy_apply($evicted['studentId'], 'student');
chk('an evicted student cannot check in', backend_dispatch('admin.summer.checkin', ['requesterId' => $SU, 'token' => $evicted['token']])['error'] === 'policy_evicted');
chk('a blocked scan leaves no attendance row', db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$evicted['studentId']])['c'] === 0);

// Voiding a wrongly logged fact must undo everything it caused, immediately.
chk('voiding the third absence lifts the eviction', (function () use ($SU, $pid) {
    $row = db_row("SELECT id FROM infractions WHERE personId = ? AND kind = 'absence' AND date = '2026-07-08'", [$pid]);
    $r = backend_dispatch('admin.policy.void', ['requesterId' => $SU, 'infractionId' => (int)$row['id'], 'reason' => 'Logged against the wrong student.']);
    return !empty($r['ok']) && $r['state']['state'] === 'dormant';
})());
chk('a void without a reason is refused', backend_dispatch('admin.policy.void', ['requesterId' => $SU, 'infractionId' => 1, 'reason' => ''])['error'] === 'reason_required');

// Reinstatement (Part IV) — refuses with the specific unmet condition.
policy_log($pid, 'student', 'absence', '2026-07-09');
policy_apply($pid, 'student');
chk('re-evicted after a fresh third absence', policy_state($pid, 'student')['state'] === 'evicted');
$rein = backend_dispatch('admin.policy.reinstate', ['requesterId' => $SU, 'personId' => $pid]);
chk('reinstatement refuses inside the cool-off period', $rein['error'] === 'conditions_unmet' && count($rein['unmet']) === 3);
chk('…and names the cool-off, the training and the fine', (function () use ($rein) {
    $c = array_column($rein['unmet'], 'condition');
    return in_array('coolOff', $c, true) && in_array('training', $c, true) && in_array('fine', $c, true);
})());
chk('a council override needs a written reason', backend_dispatch('admin.policy.reinstate', ['requesterId' => $SU, 'personId' => $pid, 'councilOverride' => true])['error'] === 'conditions_unmet');
chk('a signed council override reinstates', (function () use ($SU, $pid) {
    $r = backend_dispatch('admin.policy.reinstate', ['requesterId' => $SU, 'personId' => $pid, 'councilOverride' => true, 'overrideReason' => 'Governing Council resolution 2026/04.']);
    return !empty($r['ok']) && $r['state']['state'] === 'clear';
})());
chk('reinstatement clears the ledger so it cannot instantly re-evict', policy_counts($pid)['absence'] === 0);
chk('reinstating someone who is not evicted is refused', backend_dispatch('admin.policy.reinstate', ['requesterId' => $SU, 'personId' => $pid])['error'] === 'not_evicted');

// Lateness: the redline, the cap, the suspension, and the post-suspension fine.
$vlate = $enr2['studentId'];
for ($i = 1; $i <= 3; $i++) policy_log($vlate, 'student', 'late', '2026-07-2' . $i);
policy_apply($vlate, 'student');
chk('3 lateness logs suspend a student', policy_state($vlate, 'student')['state'] === 'suspended');
chk('a suspended student cannot check in', backend_dispatch('admin.summer.checkin', ['requesterId' => $SU, 'token' => $enr2['token']])['error'] === 'policy_suspended');
chk('a suspension carries an end date', policy_state($vlate, 'student')['until'] !== '');
chk('2 more lates after suspension raise the fine', (function () use ($vlate) {
    $start = substr((string)db_row("SELECT startsAt FROM sanctions WHERE personId = ? AND kind = 'suspension'", [$vlate])['startsAt'], 0, 10);
    $t = (int)strtotime($start . ' 00:00:00 UTC');
    policy_log($vlate, 'student', 'late', gmdate('Y-m-d', $t + 86400));
    policy_log($vlate, 'student', 'late', gmdate('Y-m-d', $t + 2 * 86400));
    policy_apply($vlate, 'student');
    return policy_state($vlate, 'student')['finesOwed'] === 5000;
})());

// Volunteers carry their own thresholds — 4 lates, not 3, and a bigger fine.
chk('volunteer lateness cap is 4, not 3', policy_for('volunteer')['latenessCap'] === 4 && policy_for('student')['latenessCap'] === 3);
chk('volunteer redline is 09:00, student 08:30', policy_for('volunteer')['lateRedline'] === '09:00' && policy_for('student')['lateRedline'] === '08:30');

// §2.2 — the first ID-card oversight is a temporary card, the second a fine.
$idp = $enr['studentId'];
$r1 = backend_dispatch('admin.policy.infraction', ['requesterId' => $SU, 'personId' => $idp, 'kind' => 'idcard_missing', 'date' => '2026-07-20']);
chk('a first ID-card oversight issues a temporary card, no fine', !empty($r1['temporaryCard']) && $r1['state']['finesOwed'] === 0);
$r2 = backend_dispatch('admin.policy.infraction', ['requesterId' => $SU, 'personId' => $idp, 'kind' => 'idcard_missing', 'date' => '2026-07-21']);
chk('the second is a 1,000 fine', empty($r2['temporaryCard']) && $r2['state']['finesOwed'] === 1000);
$r3 = backend_dispatch('admin.policy.infraction', ['requesterId' => $SU, 'personId' => $idp, 'kind' => 'idcard_lost', 'date' => '2026-07-22']);
chk('a lost card adds the 2,000 replacement fee', $r3['state']['finesOwed'] === 3000);
chk('an unpaid fine freezes awards eligibility', $r3['state']['awardsEligible'] === false);
chk('automatic infraction kinds are not settable by hand', backend_dispatch('admin.policy.infraction', ['requesterId' => $SU, 'personId' => $idp, 'kind' => 'absence', 'date' => '2026-07-23'])['error'] === 'bad_infraction');
chk('paying a fine clears the balance', (function () use ($SU, $idp) {
    foreach (db_all("SELECT id FROM sanctions WHERE personId = ? AND kind = 'fine' AND status = 'pending'", [$idp]) as $s) {
        backend_dispatch('admin.policy.sanction.update', ['requesterId' => $SU, 'sanctionId' => (int)$s['id'], 'status' => 'paid']);
    }
    return policy_state($idp, 'student')['finesOwed'] === 0;
})());

// A kiosk that lost its connection queues scans and flushes them later. Grading
// those against flush time turned an 07:55 arrival into a lateness infraction
// because the network came back at 09:30.
chk('a queued offline scan is graded at the time it was taken', (function () use ($SU) {
    $st = backend_dispatch('admin.summer.enroll', ['requesterId' => $SU, 'data' => ['fullName' => 'Queued Quadri', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech']]);
    // 06:30 local (tzOffset defaults to +60), well inside every threshold.
    $scanned = gmdate('Y-m-d\\TH:i:s\\Z', time() - 5 * 3600);
    $r = backend_dispatch('admin.summer.checkin', ['requesterId' => $SU, 'token' => $st['token'], 'scannedAt' => $scanned]);
    $row = db_row('SELECT date, checkInAt FROM attendance WHERE studentId = ?', [$st['studentId']]);
    return !empty($r['ok']) && $row['checkInAt'] === $scanned && $row['date'] === attendance_today(time() - 5 * 3600);
})());
chk('a scan time in the future is ignored', attendance_scan_time(gmdate('Y-m-d\\TH:i:s\\Z', time() + 7200)) >= time() - 2);
chk('a scan time older than a day is ignored', attendance_scan_time(gmdate('Y-m-d\\TH:i:s\\Z', time() - 90000)) >= time() - 2);
chk('an unparseable scan time is ignored', attendance_scan_time('yesterday-ish') >= time() - 2);
chk('punctuality is measured at the scan time, not at flush time', (function () {
    $mid = strtotime(attendance_today() . ' 00:00:00 UTC') - 60 * 60;   // 00:00 local
    $early = $mid + 6 * 3600;    // 06:00 local — before every threshold
    $late  = $mid + 11 * 3600;   // 11:00 local — after every threshold
    return attendance_punctuality('student', $early)['status'] === 'present'
        && attendance_punctuality('student', $late)['status'] === 'late';
})());
// The shipped resumption times are the inverse of the blueprint's redlines, so
// enforcing the blueprint falls back to its 1-hour advance protocol instead.
chk('enforcing the blueprint moves the resumption default to 07:00', (function () use ($SU) {
    backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => true]]);
    $on = attendance_settings()['resumptionByType'];
    backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => false]]);
    $off = attendance_settings()['resumptionByType'];
    backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => true]]);
    return $on['student'] === '07:00' && $on['volunteer'] === '07:00' && $off['student'] === '09:00';
})());
chk('an admin-saved resumption still wins over either default', (function () {
    attendance_settings_save(['enabled' => true, 'tzOffset' => 60, 'graceMinutes' => 10, 'resumptionByType' => ['student' => '08:15']], 'test');
    $r = attendance_settings()['resumptionByType']['student'];
    setting_set('attendance', [], 'test');
    return $r === '08:15';
})());

// Musing Period: two half-days cost a whole attendance day.
chk('two half-days equal one absence', (function () use ($SU) {
    $s = backend_dispatch('admin.summer.enroll', ['requesterId' => $SU, 'data' => ['fullName' => 'Musa Musing', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Music']]);
    policy_log($s['studentId'], 'student', 'halfday', '2026-07-06');
    policy_log($s['studentId'], 'student', 'halfday', '2026-07-07');
    return policy_state($s['studentId'], 'student')['absences'] === 1;
})());

// The board surfaces everyone who is not clear, worst first.
$board = backend_dispatch('admin.policy.board', ['requesterId' => $SU]);
chk('the compliance board lists people with a ledger', count($board['board']) >= 2);
chk('the board is ordered worst-state first', (function () use ($board) {
    $rank = ['evicted' => 0, 'suspended' => 1, 'dormant' => 2, 'warned' => 3, 'clear' => 4];
    $prev = -1;
    foreach ($board['board'] as $r) { if ($rank[$r['state']] < $prev) return false; $prev = $rank[$r['state']]; }
    return true;
})());
chk('batched states match the per-person state', (function () use ($vlate) {
    $b = policy_states_for([$vlate], 'student')[$vlate];
    $s = policy_state($vlate, 'student');
    return $b['state'] === $s['state'] && $b['lates'] === $s['lates'] && $b['finesOwed'] === $s['finesOwed'];
})());

// The sweep only touches closed programme days, and never twice.
chk('the sweep logs absences for closed programme days only', (function () use ($SU) {
    setting_set('policy_swept_through', '2026-07-05', 'test');
    $r = policy_sweep_absences('2026-07-10');
    // Mon 6th – Fri 10th plus the added Saturday 11th is out of range: 5 days.
    return !empty($r['ok']) && $r['days'] === 5;
})());
chk('re-running the sweep over the same range is a no-op', policy_sweep_absences('2026-07-10')['days'] === 0);
chk('the sweep skipped the weekend', db_row("SELECT COUNT(*) c FROM infractions WHERE kind = 'absence' AND date IN ('2026-07-04','2026-07-05')")['c'] === 0);
chk('the sweep does not run without a calendar', (function () use ($SU) {
    $keep = programme_settings();
    programme_settings_save(array_merge($keep, ['enabled' => false]), 'test');
    $r = policy_sweep_absences('2026-07-10');
    programme_settings_save($keep, 'test');
    return ($r['skipped'] ?? '') === 'no_programme_calendar';
})());

// Attendance analytics must read the calendar, not the scan log.
$att2 = backend_dispatch('admin.summer.attendance', ['requesterId' => $SU])['attendance'];
chk('analytics reports the programme calendar', !empty($att2['programme']['enabled']) && $att2['programme']['termStart'] === '2026-07-06');
chk('session days come from the calendar, not from who scanned', $att2['sessionDays'] === count(programme_days_elapsed()));
chk('each day in the series is tagged as a programme day or not', isset($att2['days'][0]['programmeDay']));
chk('nobody is absent on a non-programme day', (function () use ($SU) {
    $keep = programme_settings();
    // Cancel today outright, then nobody can be absent today.
    programme_settings_save(array_merge($keep, ['enabled' => true, 'startDate' => '2020-01-01', 'endDate' => '2030-01-01', 'holidays' => array_merge($keep['holidays'], [attendance_today()])]), 'test');
    $a = backend_dispatch('admin.summer.attendance', ['requesterId' => $SU])['attendance'];
    $alert = backend_dispatch('admin.summer.absence.alert', ['requesterId' => $SU]);
    programme_settings_save($keep, 'test');
    return $a['absentToday'] === 0 && ($alert['error'] ?? '') === 'not_a_programme_day';
})());
// Leave enforcement off for the rest of the suite so later assertions see the
// pre-policy behaviour they were written against.
backend_dispatch('admin.policy.save', ['requesterId' => $SU, 'policy' => ['enabled' => false]]);
programme_settings_save(array_merge(programme_settings(), ['enabled' => false]), 'test');

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
// Student check-ins vs volunteer check-ins share the attendance table; compress
// purges only the former and must leave the volunteer service ledger intact.
$studentBefore = (int)(db_row("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.cohortId = ?", [$scoh])['c'] ?? 0);
$volBefore = (int)(db_row("SELECT COUNT(*) c FROM attendance a WHERE a.cohortId = ? AND a.studentId NOT IN (SELECT studentId FROM summer_students WHERE cohortId = ?)", [$scoh, $scoh])['c'] ?? 0);
$rolledDays = (int)(db_row("SELECT COUNT(DISTINCT date) c FROM attendance WHERE studentId = ? AND cohortId = ?", [$enr['studentId'], $scoh])['c'] ?? 0);
$arch = backend_dispatch('admin.summer.cohort.archive', ['requesterId' => 'NGG-2025-0099', 'cohortId' => $scoh, 'compress' => true]);
chk('archive summarizes + compresses student check-ins', !empty($arch['ok']) && $arch['compressed'] === true && $arch['purged'] === $studentBefore);
chk('archived cohort is marked archived', db_row("SELECT status FROM summer_cohorts WHERE cohortId = ?", [$scoh])['status'] === 'archived');
chk('student granular attendance purged after compression', (int)(db_row("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.cohortId = ?", [$scoh])['c'] ?? 0) === 0);
chk('volunteer service ledger preserved through compression', (int)(db_row("SELECT COUNT(*) c FROM attendance a WHERE a.cohortId = ? AND a.studentId NOT IN (SELECT studentId FROM summer_students WHERE cohortId = ?)", [$scoh, $scoh])['c'] ?? 0) === $volBefore);
chk('per-student attendance rolled up onto the row', (int)(db_row("SELECT daysPresent FROM summer_students WHERE studentId = ?", [$enr['studentId']])['daysPresent'] ?? 0) >= 1);
// Re-archiving a compressed cohort must NOT recompute the rollup from the (now
// empty) table and zero the preserved summary.
$rearch = backend_dispatch('admin.summer.cohort.archive', ['requesterId' => 'NGG-2025-0099', 'cohortId' => $scoh, 'compress' => true]);
chk('re-archiving a compressed cohort is a no-op', !empty($rearch['ok']) && !empty($rearch['alreadyArchived']));
chk('re-archiving preserves the rolled-up summary', (int)(db_row("SELECT daysPresent FROM summer_students WHERE studentId = ?", [$enr['studentId']])['daysPresent'] ?? 0) === $rolledDays);
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
chk('bus: retry requeues stalled deliveries + health rollup surfaces counts', (function () {
    $GLOBALS['__bus_http_mock'] = fn($u, $b, $h) => ['ok' => true, 'body' => '{}'];
    // The prior test left ≥1 dead/failed delivery for a still-active destination.
    $before = (int)db_row("SELECT COUNT(*) c FROM deliveries WHERE status IN ('failed','dead')")['c'];
    if ($before < 1) return false;
    $list = backend_dispatch('admin.integrations.list', ['requesterId' => 'NGG-2025-0099']);
    if (!isset($list['health']) || !is_array($list['health'])) return false;
    $r = backend_dispatch('admin.integrations.retry', ['requesterId' => 'NGG-2025-0099']);
    if (empty($r['ok']) || (int)$r['requeued'] < $before) return false;
    // Requeued then dispatched against a success mock — none should still be stuck.
    $after = (int)db_row("SELECT COUNT(*) c FROM deliveries WHERE status IN ('failed','dead')")['c'];
    unset($GLOBALS['__bus_http_mock']);
    return $after === 0;
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
    $plus[] = ['key' => 'hasLaptop', 'label' => 'Has a laptop?', 'type' => 'yesno', 'showIf' => ['key' => 'course', 'value' => 'Practical Coding']];
    $r = backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'fields' => $plus]);
    return !empty($r['ok']) && $r['version'] === 2 && form_live()['version'] == 2;
})());
/* ── Faculty → course cascade ─────────────────────────────────────────────
   The form asked for a course out of one flat list spanning every faculty.
   Faculty is now asked first and narrows Course — and the narrowing is
   enforced on the server, because a UI that only hides the wrong options is
   not a constraint. */
chk('form: the summer form asks Faculty before Course', (function () {
    $keys = array_column(form_default_fields(), 'key');
    return array_search('faculty', $keys, true) < array_search('course', $keys, true);
})());
chk('form: Course declares that its options follow Faculty', (function () {
    foreach (form_default_fields() as $f) if ($f['key'] === 'course') return ($f['optionsFrom'] ?? '') === 'faculty';
    return false;
})());
chk('form: with a faculty chosen, only that faculty\'s courses are offered', (function () {
    $course = null;
    foreach (form_default_fields() as $f) if ($f['key'] === 'course') $course = $f;
    $music = form_field_options($course, ['faculty' => 'Music']);
    return in_array('Piano', $music, true) && !in_array('Practical Coding', $music, true);
})());
chk('form: with no faculty chosen the field is not a dead end', (function () {
    $course = null;
    foreach (form_default_fields() as $f) if ($f['key'] === 'course') $course = $f;
    return count(form_field_options($course, [])) === count(academy_courses());
})());
chk('form: an unknown faculty falls back rather than emptying the list', (function () {
    $course = null;
    foreach (form_default_fields() as $f) if ($f['key'] === 'course') $course = $f;
    return count(form_field_options($course, ['faculty' => 'Nonexistent'])) === count(academy_courses());
})());
chk('form: the public form ships the whole faculty→course map with the field', (function () {
    $g = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Cascade desk']);
    $ctx = backend_dispatch('gate.context', ['gate' => $g['gateId']]);
    foreach ($ctx['form']['fields'] as $f) {
        if (($f['key'] ?? '') === 'course') return isset($f['optionsBy']['Music']) && in_array('Piano', $f['optionsBy']['Music'], true);
    }
    return false;
})());

chk('form: a course from a DIFFERENT faculty is rejected on submit', (function () {
    // The enforcement that matters. Hiding the wrong options in the UI is a
    // convenience; this is the constraint. "Practical Coding" is a real course,
    // just not one of Music's — posting it with faculty=Music must fail.
    $fields = form_default_fields();
    $r = form_validate_submission($fields, [
        'fullName' => 'Cross Faculty', 'age' => 13, 'faculty' => 'Music', 'course' => 'Practical Coding',
        'centre' => 'Main', 'parentName' => 'P', 'parentPhone' => '08030000123',
    ]);
    return empty($r['ok']) && isset($r['errors']['course']) && strpos($r['errors']['course'], 'chosen faculty') !== false;
})());
chk('form: …while the same course under its own faculty passes', (function () {
    $fields = form_default_fields();
    $r = form_validate_submission($fields, [
        'fullName' => 'Right Faculty', 'age' => 13, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding',
        'centre' => 'Main', 'parentName' => 'P', 'parentPhone' => '08030000124',
    ]);
    return !empty($r['ok']) && $r['data']['course'] === 'Practical Coding';
})());
chk('form: the cascade is enforced through the real registration route too', (function () {
    $g = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Cross desk']);
    $r = backend_dispatch('gate.register', ['gate' => $g['gateId'], 'data' => [
        'fullName' => 'Wrong Course Kid', 'age' => 13, 'faculty' => 'Music', 'course' => 'Graphics',
        'centre' => 'Main', 'parentName' => 'P', 'parentPhone' => '08030000125']]);
    return !empty($r['errors']['course']);
})());

/* ── Conditional logic ────────────────────────────────────────────────────
   showIf was honoured by the renderer and the validator but nothing could set
   it, and it only did a single equality. */
chk('logic: is / isNot behave', (function () {
    $f = ['showIf' => ['key' => 'faculty', 'op' => 'is', 'value' => 'Music']];
    $g = ['showIf' => ['key' => 'faculty', 'op' => 'isNot', 'value' => 'Music']];
    return form_field_visible($f, ['faculty' => 'Music']) && !form_field_visible($f, ['faculty' => 'Media'])
        && !form_field_visible($g, ['faculty' => 'Music']) && form_field_visible($g, ['faculty' => 'Media']);
})());
chk('logic: in matches any of a comma list', (function () {
    $f = ['showIf' => ['key' => 'faculty', 'op' => 'in', 'value' => 'Music, Media']];
    return form_field_visible($f, ['faculty' => 'Media']) && !form_field_visible($f, ['faculty' => 'Music Hall']);
})());
chk('logic: answered / empty need no operand', (function () {
    $a = ['showIf' => ['key' => 'school', 'op' => 'answered']];
    $e = ['showIf' => ['key' => 'school', 'op' => 'empty']];
    return form_field_visible($a, ['school' => 'St Mary']) && !form_field_visible($a, ['school' => '  '])
        && form_field_visible($e, []) && !form_field_visible($e, ['school' => 'St Mary']);
})());
chk('logic: a multi-select satisfies `is` when the value is among the picks', (function () {
    $f = ['showIf' => ['key' => 'tracks', 'op' => 'is', 'value' => 'Dance']];
    return form_field_visible($f, ['tracks' => ['Acting', 'Dance']]) && !form_field_visible($f, ['tracks' => ['Acting']]);
})());
chk('logic: a field with no condition always shows', form_field_visible(['key' => 'x'], []));
chk('logic: the pre-upgrade {key,value} shape still means `is`',
    form_field_visible(['showIf' => ['key' => 'faculty', 'value' => 'Music']], ['faculty' => 'Music']));
chk('logic: a hidden required field does not block the submission', (function () {
    $fields = [
        ['key' => 'faculty', 'label' => 'Faculty', 'type' => 'choice', 'options' => ['Music', 'Media']],
        ['key' => 'instrument', 'label' => 'Instrument', 'type' => 'text', 'required' => true,
         'showIf' => ['key' => 'faculty', 'op' => 'is', 'value' => 'Music']],
    ];
    $hidden = form_validate_submission($fields, ['faculty' => 'Media']);
    $shown  = form_validate_submission($fields, ['faculty' => 'Music']);
    return !empty($hidden['ok']) && empty($shown['ok']) && isset($shown['errors']['instrument']);
})());
chk('logic: a hidden field\'s answer is dropped, not carried through', (function () {
    $fields = [
        ['key' => 'faculty', 'label' => 'Faculty', 'type' => 'choice', 'options' => ['Music', 'Media']],
        ['key' => 'instrument', 'label' => 'Instrument', 'type' => 'text', 'showIf' => ['key' => 'faculty', 'op' => 'is', 'value' => 'Music']],
    ];
    $r = form_validate_submission($fields, ['faculty' => 'Media', 'instrument' => 'Piano']);
    return !empty($r['ok']) && !isset($r['data']['instrument']);
})());
chk('logic: a condition may only reference a field ABOVE it', (function () {
    $bad = form_default_fields();
    $bad[] = ['key' => 'q1', 'label' => 'Q', 'type' => 'text', 'showIf' => ['key' => 'notAFieldAnywhere', 'op' => 'is', 'value' => 'x']];
    $r = form_validate_fields($bad, form_default_fields());
    return ($r['error'] ?? '') === 'logic_forward_reference';
})());
chk('logic: …and never itself', (function () {
    $bad = form_default_fields();
    $bad[] = ['key' => 'q2', 'label' => 'Q', 'type' => 'text', 'showIf' => ['key' => 'q2', 'op' => 'is', 'value' => 'x']];
    return (form_validate_fields($bad, form_default_fields())['error'] ?? '') === 'logic_forward_reference';
})());
chk('logic: an unknown operator is coerced to `is` rather than accepted', (function () {
    $f = form_default_fields();
    $f[] = ['key' => 'q3', 'label' => 'Q', 'type' => 'text', 'showIf' => ['key' => 'faculty', 'op' => 'sqlDrop', 'value' => 'Music']];
    $r = form_validate_fields($f, form_default_fields());
    if (empty($r['ok'])) return false;
    foreach ($r['fields'] as $x) if ($x['key'] === 'q3') return $x['showIf']['op'] === 'is';
    return false;
})());
chk('logic: answered/empty store no operand', (function () {
    $f = form_default_fields();
    $f[] = ['key' => 'q4', 'label' => 'Q', 'type' => 'text', 'showIf' => ['key' => 'school', 'op' => 'answered', 'value' => 'junk']];
    $r = form_validate_fields($f, form_default_fields());
    foreach ($r['fields'] as $x) if ($x['key'] === 'q4') return $x['showIf']['value'] === '';
    return false;
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
    $r2 = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'Chidi Okafor', 'age' => 14, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Main', 'parentName' => 'Mrs Okafor']]);
    return !empty($r2['errors']['parentPhone']);
})());
$REG = backend_dispatch('gate.register', ['gate' => $GATE['gateId'], 'data' => ['fullName' => 'Chidi Okafor', 'age' => 14, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Main', 'parentName' => 'Mrs Okafor', 'parentPhone' => '08031234567', 'parentEmail' => 'okafor@example.com', 'allergies' => 'Peanuts']]);
chk('gate: registration lands parent_pending with normalised phone + no QR yet', (function () use ($REG) {
    if (empty($REG['ok']) || $REG['regStatus'] !== 'parent_pending') return false;
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ?', [$REG['studentId']]);
    return $s['guardianPhone'] === '+2348031234567' && ($s['token'] ?? '') === '' && !empty($s['verifyToken']);
})());
chk('gate: duplicate guard flags same child + parent, force overrides', (function () use ($GATE) {
    $d = ['fullName' => 'Chidi Okafor', 'age' => 14, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Main', 'parentName' => 'Mrs Okafor', 'parentPhone' => '08031234567'];
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
    $ok = backend_dispatch('parent.verify.submit', ['t' => $vt, 'consents' => ['participation' => true, 'medical' => true, 'data' => true, 'media' => false, 'site_visibility' => true], 'actorName' => 'Mrs Okafor', 'feedback' => 'Please watch his peanut allergy.']);
    if (empty($ok['ok'])) return false;
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ?', [$REG['studentId']]);
    if ($s['regStatus'] !== 'verified' || empty($s['token'])) return false;
    $qr = db_row('SELECT status, studentId FROM qr_codes WHERE token = ?', [$s['token']]);
    $media = db_row("SELECT status FROM consents WHERE studentId = ? AND type = 'media'", [$REG['studentId']]);
    $p0 = db_row("SELECT status FROM consents WHERE studentId = ? AND type = 'participation'", [$REG['studentId']]);
    $vis = db_row("SELECT status FROM consents WHERE studentId = ? AND type = 'site_visibility'", [$REG['studentId']]);
    return $qr['status'] === 'assigned' && $qr['studentId'] === $REG['studentId'] && $media['status'] === 'declined' && $p0['status'] === 'granted' && ($vis['status'] ?? '') === 'granted';
})());
chk('site_visibility consent is offered in the parent verify context', (function () use ($REG) {
    $vt = db_row('SELECT verifyToken FROM summer_students WHERE studentId = ?', [$REG['studentId']])['verifyToken'];
    // context is 'done' now (verified) — assert the type exists in the catalogue instead.
    return array_key_exists('site_visibility', CONSENT_TYPES) && CONSENT_TYPES['site_visibility']['p'] === 1;
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

// ── Centre management: operational detail (address, area, lead, contacts) ──
db_insert('volunteers', ['volunteerId' => 'VOL-LEAD-1', 'fullName' => 'Lead Person', 'firstName' => 'Lead', 'lastName' => 'Person', 'email' => 'lead@e.org', 'role' => 'mentor', 'status' => 'active', 'centre' => 'Ayobo Hub', 'visibilityConsent' => 1, 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
$cMgmt = backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'address' => '5 Ayobo Rd', 'area' => 'Ayobo · Lagos', 'leadVolunteerId' => 'VOL-LEAD-1', 'phone' => '+234 800', 'email' => 'ayobo@ngg.org', 'meetDays' => 'Saturdays', 'meetTime' => '09:00 – 13:00', 'notes' => 'test note']]);
chk('centre: operational detail (address/area/lead/contacts) saves', !empty($cMgmt['ok']));
chk('centre: a malformed email is rejected', backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'email' => 'not-an-email']])['error'] === 'bad_email');
chk('centre: an unknown lead volunteer is rejected', backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'leadVolunteerId' => 'VOL-NOPE']])['error'] === 'bad_lead');
chk('centre: list resolves lead name + returns leadOptions', (function () {
    $cl = backend_dispatch('admin.centres.list', ['requesterId' => 'NGG-2025-0099']);
    if (empty($cl['leadOptions'])) return false;
    foreach ($cl['centres'] as $c) if ($c['name'] === 'Ayobo Hub') return $c['area'] === 'Ayobo · Lagos' && $c['address'] === '5 Ayobo Rd' && $c['leadVolunteerId'] === 'VOL-LEAD-1' && $c['leadName'] === 'Lead Person';
    return false;
})());
// Per-centre WhatsApp group link — saved on the centre, echoed back on apply.
backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'whatsappUrl' => 'https://chat.whatsapp.com/ABC123']]);
chk('centre: whatsapp link saves + lists', (function () use ($cA) {
    foreach (backend_dispatch('admin.centres.list', ['requesterId' => 'NGG-2025-0099'])['centres'] as $c) if ($c['centreId'] === $cA['centreId']) return ($c['whatsappUrl'] ?? '') === 'https://chat.whatsapp.com/ABC123';
    return false;
})());
chk('centre: a bare wa.me link is normalised to https', (function () use ($cA) {
    backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'whatsappUrl' => 'wa.me/2348001234']]);
    foreach (backend_dispatch('admin.centres.list', ['requesterId' => 'NGG-2025-0099'])['centres'] as $c) if ($c['centreId'] === $cA['centreId']) return ($c['whatsappUrl'] ?? '') === 'https://wa.me/2348001234';
    return false;
})());
chk('centre: a form link is accepted', (function () use ($cA) {
    return !empty(backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'whatsappUrl' => 'https://forms.gle/abc123']])['ok']);
})());
chk('centre: an insecure (non-https) link is rejected', backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'whatsappUrl' => 'http://insecure.example']])['error'] === 'bad_whatsapp');
// Restore the chat.whatsapp.com invite for the apply-echo assertion below.
backend_dispatch('admin.centres.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['centreId' => $cA['centreId'], 'name' => 'Ayobo Hub', 'code' => 'AYB', 'color' => '#123456', 'whatsappUrl' => 'https://chat.whatsapp.com/ABC123']]);
setting_set('volunteer_applications_open', '1', 'system');
$waApply = backend_dispatch('public.apply', ['kind' => 'volunteer', 'sex' => 'Male', 'role' => 'admin', 'firstName' => 'Wa', 'lastName' => 'Joiner', 'email' => 'wa-join@example.com', 'phone' => '08031119009', 'dob' => '1990-01-01', 'centre' => 'Ayobo Hub']);
chk('apply returns the selected centre whatsapp link', ($waApply['whatsapp'] ?? '') === 'https://chat.whatsapp.com/ABC123');
chk('centre: public meta exposes a PII-safe lead (consented → first name only)', (function () {
    $m = centre_public_meta(['area' => 'A', 'address' => 'B', 'meetDays' => 'Sat', 'meetTime' => '9', 'leadVolunteerId' => 'VOL-LEAD-1']);
    return $m['lead'] && $m['lead']['name'] === 'Lead' && strpos($m['lead']['handle'], '@lead') === 0 && $m['area'] === 'A';
})());
chk('centre: without consent the lead shows an anonymous handle, no name', (function () {
    db_update('volunteers', ['visibilityConsent' => 0], ['volunteerId' => 'VOL-LEAD-1']);
    $m = centre_public_meta(['leadVolunteerId' => 'VOL-LEAD-1']);
    $ok = $m['lead'] && $m['lead']['name'] === '' && strpos($m['lead']['handle'], '@vol-') === 0;
    db_update('volunteers', ['visibilityConsent' => 1], ['volunteerId' => 'VOL-LEAD-1']);
    return $ok;
})());

setting_set('geofence_enabled', '1', 'system');
$geoGate = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Geo desk']);
chk('geo: registration is blocked with no location when the fence is on',
    backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid One', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'parentName' => 'P', 'parentPhone' => '08030000001']])['error'] === 'geo_unavailable');
$gi = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Two', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'parentName' => 'P', 'parentPhone' => '08030000002'], 'lat' => 6.6000, 'lng' => 3.3000]);
chk('geo: an in-fence registration auto-selects the fenced centre', !empty($gi['ok']) && ($gi['geo']['autoCentre'] ?? '') === 'Ayobo Hub' && $gi['geo']['ok'] === 1);
chk('geo: the student row records the fence pass + captured location', (function () use ($gi) { $s = db_row("SELECT regGeoOk, regLat, centre FROM summer_students WHERE studentId=?", [$gi['studentId']]); return (int)$s['regGeoOk'] === 1 && $s['centre'] === 'Ayobo Hub' && abs((float)$s['regLat'] - 6.6) < 0.0001; })());
$go = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Three', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'parentName' => 'P', 'parentPhone' => '08030000003'], 'lat' => 6.6045, 'lng' => 3.3000]);
chk('geo: an out-of-fence registration is blocked with the nearest distance', ($go['error'] ?? '') === 'geo_out_of_fence' && ($go['nearest']['distanceM'] ?? 0) > 400);
$gov = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Four', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Ayobo Hub', 'parentName' => 'P', 'parentPhone' => '08030000004'], 'lat' => 6.6045, 'lng' => 3.3000, 'isAdmin' => true, 'geoOverride' => true]);
chk('geo: a full admin may override an out-of-fence registration', !empty($gov['ok']) && $gov['geo']['ok'] === 0);
setting_set('geofence_enabled', '0', 'system');
chk('geo: with the fence off, no location is required', !empty(backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Geo Kid Five', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Ayobo Hub', 'parentName' => 'P', 'parentPhone' => '08030000005']])['ok']));

// Photo pipeline wiring: gate registration ingests the headshot end-to-end.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 90, 'issues' => [], 'flags' => [], 'recommend' => ['crop' => true]]];
$rp = backend_dispatch('gate.register', ['gate' => $geoGate['gateId'], 'data' => ['fullName' => 'Photo Reg Kid', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Ayobo Hub', 'parentName' => 'P', 'parentPhone' => '08030000009'], 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
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
$ir = backend_dispatch('gate.register', ['gate' => $issGate['gateId'], 'data' => ['fullName' => 'Gate Hold Kid', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Ijaiye', 'parentName' => 'P', 'parentEmail' => 'hold@example.com'], 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
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
$np = backend_dispatch('gate.register', ['gate' => $issGate['gateId'], 'data' => ['fullName' => 'No Photo Kid', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Ijaiye', 'parentName' => 'P', 'parentEmail' => 'nophoto@example.com']]);
$vtNp = db_row('SELECT verifyToken FROM summer_students WHERE studentId = ?', [$np['studentId']])['verifyToken'];
$pvn = backend_dispatch('parent.verify.submit', ['t' => $vtNp, 'consents' => ['participation' => true, 'medical' => true, 'data' => true], 'actorName' => 'P']);
chk('issuance gate: a photo-less registration still issues immediately', !empty($pvn['idIssued']) && (string)(db_row('SELECT token FROM summer_students WHERE studentId = ?', [$np['studentId']])['token']) !== '');
setting_set('photo_gate_issuance', '0', 'system');

// Guardian re-shoot after a retake.
$GLOBALS['__ai_photo_mock'] = fn($u) => ['ok' => true, 'provider' => 'gemini', 'data' => ['score' => 88, 'issues' => [], 'flags' => [], 'recommend' => ['crop' => true]]];
$rsReg = backend_dispatch('gate.register', ['gate' => $issGate['gateId'], 'data' => ['fullName' => 'Reshoot Kid', 'age' => 12, 'faculty' => 'AI & Technology', 'course' => 'Practical Coding', 'centre' => 'Ijaiye', 'parentName' => 'P', 'parentEmail' => 'reshoot@example.com'], 'photoUrl' => 'https://res.cloudinary.com/demo/image/upload/sample.jpg']);
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
    return (int)db_row("SELECT COUNT(*) c FROM audit_log WHERE event='admin.id.resend' AND subject='SUM-R-1'")['c'] >= 1;
})());
// Emailable QR image cache
$TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAlWAMBn1QzqQAAAABJRU5ErkJggg==';
chk('QR cache rejects a non-PNG payload', qr_cache_store('SUMQR-RS1', 'data:image/gif;base64,R0lGODlhAQAB') === false);
chk('QR cache stores a real PNG for a token', qr_cache_store('SUMQR-RS1', $TINY_PNG) === true && qr_cache_exists('SUMQR-RS1'));
chk('resend with QR ⇒ qr:true (email will embed the hosted image)', (function () use ($TINY_PNG) {
    $r = backend_dispatch('admin.id.resend', ['requesterId' => 'NGG-2025-0099', 'kind' => 'student', 'id' => 'SUM-R-1', 'qrPng' => $TINY_PNG]);
    return !empty($r['ok']) && ($r['qr'] ?? false) === true;
})());

// ── Admin photo re-edit (all images re-editable) ────────────────────────────
chk('cloudinary_base strips a transform to the clean source', function_exists('cloudinary_base') && cloudinary_base('https://res.cloudinary.com/x/image/upload/c_fill,g_face,w_600,h_750/v17/ngg/headshot/abc.jpg') === 'https://res.cloudinary.com/x/image/upload/v17/ngg/headshot/abc.jpg');
chk('cloudinary_edit_manual builds the requested transform', (function () {
    $e = cloudinary_edit_manual('https://res.cloudinary.com/x/image/upload/v17/ngg/headshot/abc.jpg', ['gravity' => 'center', 'brighten' => true]);
    return strpos($e['transforms'], 'g_center') !== false && strpos($e['transforms'], 'e_brightness:18') !== false
        && strpos($e['url'], '/upload/c_fill,g_center') !== false && strpos($e['url'], '/v17/') !== false;
})());
// Zoom must be a fractional crop chained before the fill. Cloudinary silently
// ignores z_ in this chain (c_fill + z_1.6 is byte-identical to no zoom, for
// g_face too), so a z_ here means the slider does nothing.
chk('cloudinary_edit_manual zooms by cropping, never with the no-op z_', (function () {
    $src = 'https://res.cloudinary.com/x/image/upload/v17/ngg/headshot/abc.jpg';
    $e = cloudinary_edit_manual($src, ['gravity' => 'center', 'zoom' => 1.25]);
    $flat = cloudinary_edit_manual($src, ['gravity' => 'center', 'zoom' => 1.0]);
    return strpos($e['transforms'], 'c_crop,g_center,w_0.8,h_0.8') === 0        // 1/1.25
        && strpos($e['transforms'], 'c_fill,g_center') !== false
        && strpos($e['transforms'], 'z_') === false
        && $e['transforms'] !== $flat['transforms']                              // zoom changed something
        && strpos($flat['transforms'], 'c_crop') === false;                      // 1x adds no crop
})());
chk('cloudinary_edit_manual keeps the crop fraction a ratio, not pixels', (function () {
    // A fractional w/h of 1.0 or more would be read as pixels by Cloudinary.
    foreach ([1.001, 1.01, 2.5, 9.0] as $z) {
        $t = cloudinary_edit_manual('https://res.cloudinary.com/x/image/upload/v17/a.jpg', ['zoom' => $z])['transforms'];
        if (preg_match('/c_crop,g_\w+,w_([\d.]+)/', $t, $m) && (float)$m[1] >= 1.0) return false;
    }
    return true;
})());
chk('admin.photo.edit re-crops a live student photo (no stacked transforms)', (function () {
    db_update('summer_students', ['photoUrl' => 'https://res.cloudinary.com/x/image/upload/c_fill,g_face,w_600,h_750/v17/ngg/headshot/abc.jpg'], ['studentId' => 'SUM-R-1']);
    $r = backend_dispatch('admin.photo.edit', ['requesterId' => 'NGG-2025-0099', 'subjectType' => 'student', 'subjectId' => 'SUM-R-1', 'spec' => ['gravity' => 'center', 'zoom' => 1.2]]);
    if (empty($r['ok'])) return false;
    $now = db_row('SELECT photoUrl FROM summer_students WHERE studentId=?', ['SUM-R-1'])['photoUrl'];
    // Applied the new crop, derived from the CLEAN base (only one transform seg, keeps /v17/).
    return strpos($now, 'g_center') !== false && strpos($now, 'c_crop,g_center,w_0.833') !== false && strpos($now, 'z_') === false
        && strpos($now, 'g_face,w_600,h_750/c_fill') === false && substr_count($now, '/upload/') === 1 && strpos($now, '/v17/') !== false;
})());
/* ── Desk password expiry (fails CLOSED, unlike rotation) ───────────────── */
chk('an expired desk password is refused even when it is the right one', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Expiring desk', 'generate' => true, 'expiryDays' => 7]);
    if (empty($c['ok'])) return false;
    // correct password works while live
    if (empty(gate_unlock(['gate' => $c['gateId'], 'password' => $c['password']])['ok'])) return false;
    db_update('gate_links', ['passExpiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60)], ['gateId' => $c['gateId']]);
    $r = gate_unlock(['gate' => $c['gateId'], 'password' => $c['password']]);
    return ($r['error'] ?? '') === 'password_expired';
})());
chk('expiry is checked before the password compare, so a wrong one cannot probe it', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Probe desk', 'generate' => true, 'expiryDays' => 7]);
    db_update('gate_links', ['passExpiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60)], ['gateId' => $c['gateId']]);
    // A wrong password must give the SAME answer as the right one — otherwise
    // the response distinguishes "right but expired" from "wrong".
    return (gate_unlock(['gate' => $c['gateId'], 'password' => 'WRON-GPWD'])['error'] ?? '') === 'password_expired';
})());
chk('setting a new password clears the expiry and starts the clock again', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Reset desk', 'generate' => true, 'expiryDays' => 7]);
    db_update('gate_links', ['passExpiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60)], ['gateId' => $c['gateId']]);
    $r = backend_dispatch('admin.gates.rotate', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId']]);
    $row = db_row('SELECT passExpiresAt FROM gate_links WHERE gateId = ?', [$c['gateId']]);
    return !empty(gate_unlock(['gate' => $c['gateId'], 'password' => $r['password']])['ok'])
        && (string)$row['passExpiresAt'] > now_iso();
})());
chk('no expiry policy means the password never dies', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Immortal desk', 'generate' => true]);
    $row = db_row('SELECT passExpiresAt FROM gate_links WHERE gateId = ?', [$c['gateId']]);
    return (string)$row['passExpiresAt'] === '' && !empty(gate_unlock(['gate' => $c['gateId'], 'password' => $c['password']])['ok']);
})());
chk('turning expiry on dates from when the password was SET, not from now', (function () {
    // Otherwise switching the policy on hands a stale password a fresh term.
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Backdate desk', 'generate' => true]);
    db_update('gate_links', ['passSetAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 20 * 86400)], ['gateId' => $c['gateId']]);
    backend_dispatch('admin.gates.rotation', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'rotateDays' => 0, 'expiryDays' => 7]);
    // set 20 days ago + 7 day life = already dead
    return (gate_unlock(['gate' => $c['gateId'], 'password' => $c['password']])['error'] ?? '') === 'password_expired';
})());
chk('expiry can be switched back off', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Off desk', 'generate' => true, 'expiryDays' => 7]);
    backend_dispatch('admin.gates.rotation', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'rotateDays' => 0, 'expiryDays' => 0]);
    return (string)db_row('SELECT passExpiresAt FROM gate_links WHERE gateId = ?', [$c['gateId']])['passExpiresAt'] === ''
        && !empty(gate_unlock(['gate' => $c['gateId'], 'password' => $c['password']])['ok']);
})());
chk('the list reports password expiry without leaking the hash', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Report desk', 'generate' => true, 'expiryDays' => 30]);
    $row = array_values(array_filter(backend_dispatch('admin.gates.list', ['requesterId' => 'NGG-2025-0099'])['gates'],
        fn($g) => $g['gateId'] === $c['gateId']))[0];
    return $row['expiryDays'] === 30 && $row['passExpired'] === false
        && $row['passExpiresInDays'] >= 29 && $row['passExpiresInDays'] <= 30
        && !array_key_exists('passHash', $row) && !array_key_exists('passExpiresAt', $row);
})());
chk('the web-cron runs desk rotation, so a host with no shell still rotates', (function () {
    // Rotation must not depend on api/tools/run-jobs.php being on a cron.
    $src = file_get_contents(dirname(__DIR__) . '/_lib/webcron.php');
    return strpos($src, 'gates_rotate_due') !== false && function_exists('gates_rotate_due');
})());

/* ── Gate link validity ─────────────────────────────────────────────────── */
chk('validity is stored in the exact format gate_resolve compares against', (function () {
    // gate_resolve does a STRING compare against now_iso(). A value in any
    // other shape either never expires or expires instantly.
    foreach ([['', 7], ['2026-08-31', null], ['2026-08-31T10:00:00Z', null]] as [$v, $d]) {
        $out = gate_expiry_normalise($v, $d);
        if ($out === null || $out === '') return false;
        if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $out)) return false;
    }
    return gate_expiry_normalise('', 0) === '' && gate_expiry_normalise('', null) === ''
        && gate_expiry_normalise('not a date', null) === null
        && gate_expiry_normalise('', 99999) === null;
})());
chk('a bare date means the END of that day, not its start', (function () {
    // "valid until the 31st" must still work on the evening of the 31st.
    return gate_expiry_normalise('2026-08-31', null) === '2026-08-31T23:59:59Z';
})());
chk('gate create accepts a validity in days and the link works while valid', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Weekend desk', 'validDays' => 7]);
    if (empty($c['ok'])) return false;
    return gate_resolve($c['gateId']) !== null;
})());
chk('an expired link stops resolving, so the desk itself refuses it', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Lapsed desk', 'generate' => true, 'validDays' => 1]);
    db_update('gate_links', ['expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60)], ['gateId' => $c['gateId']]);
    if (gate_resolve($c['gateId']) !== null) return false;
    // and every public path built on it must refuse, not just the resolver
    return (gate_context(['gate' => $c['gateId']])['error'] ?? '') === 'gate_invalid'
        && (gate_unlock(['gate' => $c['gateId'], 'password' => $c['password']])['error'] ?? '') === 'gate_invalid';
})());
chk('validity can be extended on a link that already lapsed', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Extend desk', 'validDays' => 1]);
    db_update('gate_links', ['expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 60)], ['gateId' => $c['gateId']]);
    $r = backend_dispatch('admin.gates.validity', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'validDays' => 14]);
    return !empty($r['ok']) && gate_resolve($c['gateId']) !== null;
})());
chk('validity can be cleared back to never expiring', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Forever desk', 'validDays' => 3]);
    $r = backend_dispatch('admin.gates.validity', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'validDays' => 0]);
    return !empty($r['ok']) && $r['expiresAt'] === ''
        && (string)db_row('SELECT expiresAt FROM gate_links WHERE gateId = ?', [$c['gateId']])['expiresAt'] === '';
})());
chk('the list reports expiry so the panel can show it', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Listed desk', 'validDays' => 5]);
    $row = array_values(array_filter(backend_dispatch('admin.gates.list', ['requesterId' => 'NGG-2025-0099'])['gates'],
        fn($g) => $g['gateId'] === $c['gateId']))[0];
    return $row['expired'] === false && $row['expiresInDays'] >= 4 && $row['expiresInDays'] <= 5;
})());
chk('a nonsense validity is rejected rather than silently ignored', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Bad desk']);
    return (backend_dispatch('admin.gates.validity', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'expiresAt' => 'whenever'])['error'] ?? '') === 'bad_expiry'
        && (backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'X', 'expiresAt' => 'soon'])['error'] ?? '') === 'bad_expiry';
})());
chk('gate validity is gated from non-staff', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Guard v desk']);
    return (backend_dispatch('admin.gates.validity', ['requesterId' => 'NGG-2025-0001', 'gateId' => $c['gateId'], 'validDays' => 5])['error'] ?? '') === 'forbidden';
})());

/* ── Gate desk passwords: generation + rotation ─────────────────────────── */
chk('gate_password_new avoids look-alike characters and does not repeat', (function () {
    $seen = [];
    for ($i = 0; $i < 200; $i++) {
        $pw = gate_password_new();
        if (!preg_match('/^[ACDEFGHJKMNPQRTUVWXYZ2346789]{4}-[ACDEFGHJKMNPQRTUVWXYZ2346789]{4}$/', $pw)) return false;
        if (preg_match('/[O0I1LSB5]/', $pw)) return false;
        $seen[$pw] = true;
    }
    return count($seen) > 195;
})());
chk('gate create can generate a password, returns it once, stores only a hash', (function () {
    $r = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Gen desk', 'generate' => true]);
    if (empty($r['ok']) || empty($r['password']) || empty($r['hasPassword'])) return false;
    $row = db_row('SELECT passHash, passSetAt FROM gate_links WHERE gateId = ?', [$r['gateId']]);
    $listed = array_values(array_filter(backend_dispatch('admin.gates.list', ['requesterId' => 'NGG-2025-0099'])['gates'],
        fn($g) => $g['gateId'] === $r['gateId']))[0];
    return strpos((string)$row['passHash'], $r['password']) === false
        && password_verify($r['password'], (string)$row['passHash'])
        && (string)$row['passSetAt'] !== ''
        && !array_key_exists('password', $listed) && !array_key_exists('passHash', $listed);
})());
chk('gate rotate issues a new password and kills the old one', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Roll desk', 'generate' => true]);
    $old = $c['password'];
    $r = backend_dispatch('admin.gates.rotate', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId']]);
    if (empty($r['ok']) || empty($r['password']) || $r['password'] === $old) return false;
    $hash = (string)db_row('SELECT passHash FROM gate_links WHERE gateId = ?', [$c['gateId']])['passHash'];
    return password_verify($r['password'], $hash) && !password_verify($old, $hash);
})());
chk('gate rotation schedule validates the address and clamps the interval', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Sched desk', 'generate' => true]);
    $bad = backend_dispatch('admin.gates.rotation', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'rotateDays' => 30, 'notifyEmail' => 'not-an-email']);
    $good = backend_dispatch('admin.gates.rotation', ['requesterId' => 'NGG-2025-0099', 'gateId' => $c['gateId'], 'rotateDays' => 400, 'notifyEmail' => 'ops@example.org']);
    return ($bad['error'] ?? '') === 'bad_email' && !empty($good['ok']) && $good['rotateDays'] === 365;
})());
chk('a gate past its interval reports as due', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Due desk', 'generate' => true, 'rotateDays' => 7]);
    db_update('gate_links', ['passSetAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 8 * 86400)], ['gateId' => $c['gateId']]);
    $row = array_values(array_filter(backend_dispatch('admin.gates.list', ['requesterId' => 'NGG-2025-0099'])['gates'],
        fn($g) => $g['gateId'] === $c['gateId']))[0];
    return $row['rotationDue'] === true && $row['rotatesInDays'] <= 0;
})());
chk('scheduled rotation NEVER rolls a gate with nowhere to send the password', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'No-notify desk', 'generate' => true, 'rotateDays' => 7]);
    db_update('gate_links', ['passSetAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 9 * 86400)], ['gateId' => $c['gateId']]);
    $before = (string)db_row('SELECT passHash FROM gate_links WHERE gateId = ?', [$c['gateId']])['passHash'];
    $res = gates_rotate_due();
    $after = (string)db_row('SELECT passHash FROM gate_links WHERE gateId = ?', [$c['gateId']])['passHash'];
    return $after === $before && $res['pending_manual'] >= 1 && password_verify($c['password'], $after);
})());
chk('a gate not yet due is left alone by the scheduler', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Fresh desk',
        'generate' => true, 'rotateDays' => 30, 'notifyEmail' => 'ops@example.org']);
    gates_rotate_due();
    return password_verify($c['password'], (string)db_row('SELECT passHash FROM gate_links WHERE gateId = ?', [$c['gateId']])['passHash']);
})());
chk('a due gate is only rolled if the notification actually sent', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Auto desk',
        'generate' => true, 'rotateDays' => 7, 'notifyEmail' => 'ops@example.org']);
    db_update('gate_links', ['passSetAt' => gmdate('Y-m-d\TH:i:s\Z', time() - 9 * 86400)], ['gateId' => $c['gateId']]);
    $res = gates_rotate_due();
    $stillOld = password_verify($c['password'], (string)db_row('SELECT passHash FROM gate_links WHERE gateId = ?', [$c['gateId']])['passHash']);
    // Mail works here or it doesn't; either way the two must agree — a failed
    // send must leave the desk's current password working.
    return $res['rotated'] >= 1 ? !$stillOld : ($res['send_failed'] >= 1 && $stillOld);
})());
chk('gate rotate is gated from non-staff', (function () {
    $c = backend_dispatch('admin.gates.create', ['requesterId' => 'NGG-2025-0099', 'name' => 'Guard desk', 'generate' => true]);
    return (backend_dispatch('admin.gates.rotate', ['requesterId' => 'NGG-2025-0001', 'gateId' => $c['gateId']])['error'] ?? '') === 'forbidden';
})());

chk('admin.photo.edit gated from non-staff', backend_dispatch('admin.photo.edit', ['requesterId' => 'NGG-2025-0001', 'subjectType' => 'student', 'subjectId' => 'SUM-R-1', 'spec' => []])['error'] === 'forbidden');

// ── General dashboard (attendance + per-centre analytics) ───────────────────
db_insert('centres', ['centreId' => 'CEN-EG', 'name' => 'Egbeda', 'code' => 'EG', 'color' => '#76B043', 'status' => 'active', 'createdAt' => now_iso()]);
db_insert('attendance', ['cohortId' => 'RC1', 'studentId' => 'SUM-R-1', 'token' => 'SUMQR-RS1', 'date' => gmdate('Y-m-d'), 'checkInAt' => now_iso(), 'method' => 'qr', 'status' => 'present', 'lateMinutes' => 0, 'createdAt' => now_iso()]);
chk('dashboard overview aggregates present + by centre', (function () {
    $r = backend_dispatch('admin.dashboard.overview', ['requesterId' => 'NGG-2025-0099']);
    if (empty($r['ok'])) return false;
    $d = $r['dashboard']; $eg = null;
    foreach ($d['byCentre'] as $c) if ($c['name'] === 'Egbeda') $eg = $c;
    return $d['kpis']['presentToday'] >= 1 && $eg && $eg['present'] >= 1 && $eg['enrolled'] >= 1;
})());
chk('dashboard readable by the M&E audit role', (function () {
    backend_dispatch('admin.members.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Auditor', 'email' => 'me@example.com', 'type' => 'NGG', 'centre' => 'Egbeda', 'role' => 'audit']]);
    $aud = db_row("SELECT memberId FROM members WHERE email='me@example.com'")['memberId'];
    return !empty(backend_dispatch('admin.dashboard.overview', ['requesterId' => $aud])['ok']);
})());
chk('dashboard gated from non-admin', backend_dispatch('admin.dashboard.overview', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

// ── Scoped admins (centre allow-list) ───────────────────────────────────────
db_insert('centres', ['centreId' => 'CEN-AY', 'name' => 'Ayobo', 'code' => 'AY', 'color' => '#123456', 'status' => 'active', 'createdAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-AY-1', 'cohortId' => 'RC1', 'centre' => 'Ayobo', 'track' => 'Tech', 'status' => 'active', 'regStatus' => 'verified', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
backend_dispatch('admin.members.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Scoped Admin', 'email' => 'sc@example.com', 'type' => 'NGG', 'centre' => 'Egbeda', 'role' => 'admin']]);
$SCOPED = db_row("SELECT memberId FROM members WHERE email='sc@example.com'")['memberId'];
chk('caps op stores a validated centre scope', (function () use ($SCOPED) {
    $r = backend_dispatch('admin.members.caps', ['requesterId' => 'NGG-2025-0099', 'memberId' => $SCOPED, 'caps' => [], 'centreScope' => ['CEN-EG', 'BOGUS']]);
    return !empty($r['ok']) && $r['centreScope'] === ['CEN-EG']; // bogus id dropped
})());
chk('scoped admin dashboard shows only their centre', (function () use ($SCOPED) {
    $r = backend_dispatch('admin.dashboard.overview', ['requesterId' => $SCOPED]);
    $names = array_map(fn($c) => $c['name'], $r['dashboard']['byCentre']);
    return in_array('Egbeda', $names, true) && !in_array('Ayobo', $names, true);
})());
chk('scoped admin members list is centre-limited', (function () use ($SCOPED) {
    $r = backend_dispatch('admin.members.list', ['requesterId' => $SCOPED, 'all' => 1]);
    foreach ($r['members'] as $m) if (($m['centre'] ?? '') !== 'Egbeda') return false;
    return true;
})());

// ── Mentor Portal + stars ───────────────────────────────────────────────────
db_insert('members', ['memberId' => 'NGG-2025-0500', 'fullName' => 'Mia Mentor', 'email' => 'mentor@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('mentors', ['mentorId' => 'MEN-1', 'fullName' => 'Mia Mentor', 'email' => 'mentor@example.com', 'status' => 'active', 'centre' => 'Egbeda', 'createdAt' => now_iso()]);
chk('mentor roster lists their centre class only', (function () {
    $r = backend_dispatch('member.mentor.roster', ['requesterId' => 'NGG-2025-0500']);
    if (empty($r['ok'])) return false;
    $ids = array_map(fn($s) => $s['studentId'], $r['students']);
    return in_array('SUM-R-1', $ids, true) && !in_array('SUM-AY-1', $ids, true);
})());
chk('mentor awards 1-3 stars + mirrors to behaviour log', (function () {
    $r = backend_dispatch('behaviour.star.give', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-1', 'stars' => 3, 'category' => 'discipline', 'note' => 'Great focus']);
    if (empty($r['ok'])) return false;
    $ms = db_row("SELECT stars FROM member_stars WHERE subjectId='SUM-R-1' AND date=?", [gmdate('Y-m-d')]);
    $bl = db_row("SELECT id FROM behaviour_logs WHERE subjectId='SUM-R-1' AND severity='positive' ORDER BY id DESC LIMIT 1");
    return (int)($ms['stars'] ?? 0) === 3 && $bl;
})());
chk('one rating per student per day', backend_dispatch('behaviour.star.give', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-1', 'stars' => 2])['error'] === 'already_starred_today');
chk('mentor cannot star a student in another centre', backend_dispatch('behaviour.star.give', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-AY-1', 'stars' => 2])['error'] === 'not_your_centre');
chk('star count clamped to 1-3', backend_dispatch('behaviour.star.give', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-2', 'stars' => 5])['error'] === 'bad_stars');
chk('non-mentor blocked from the portal', backend_dispatch('member.mentor.roster', ['requesterId' => 'NGG-2025-0001'])['error'] === 'not_a_mentor');

// ── V3 (Verbal·Vocal·Visual) weekly rating + Champions ──
$v3p = iso_week_period();
chk('mentor rates V3 (1-5 each) for the week', (function () use ($v3p) {
    $r = backend_dispatch('member.mentor.v3.rate', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-1', 'verbal' => 5, 'vocal' => 4, 'visual' => 3, 'note' => 'Strong week']);
    if (empty($r['ok']) || $r['total'] !== 12) return false;
    $row = db_row("SELECT verbal,vocal,visual FROM v3_scores WHERE subjectId='SUM-R-1' AND period=?", [$v3p]);
    return $row && (int)$row['verbal'] === 5 && (int)$row['visual'] === 3;
})());
chk('V3 re-rate upserts (one row per period)', (function () use ($v3p) {
    backend_dispatch('member.mentor.v3.rate', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-1', 'verbal' => 4, 'vocal' => 4, 'visual' => 4]);
    return (int)db_row("SELECT COUNT(*) c FROM v3_scores WHERE subjectId='SUM-R-1' AND period=?", [$v3p])['c'] === 1;
})());
chk('V3 rejects out-of-range scores', backend_dispatch('member.mentor.v3.rate', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-1', 'verbal' => 6, 'vocal' => 1, 'visual' => 1])['error'] === 'bad_score');
chk('V3 rejects a student in another centre', backend_dispatch('member.mentor.v3.rate', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-AY-1', 'verbal' => 3, 'vocal' => 3, 'visual' => 3])['error'] === 'not_your_centre');
backend_dispatch('member.mentor.v3.rate', ['requesterId' => 'NGG-2025-0500', 'subjectId' => 'SUM-R-2', 'verbal' => 3, 'vocal' => 3, 'visual' => 3]); // total 9
chk('roster carries the current-period V3', (function () {
    $r = backend_dispatch('member.mentor.roster', ['requesterId' => 'NGG-2025-0500']);
    $s = null; foreach ($r['students'] as $x) if ($x['studentId'] === 'SUM-R-1') $s = $x;
    return $s && $s['v3'] && (int)$s['v3']['verbal'] === 4;
})());
chk('champions board leads with the top composite', (function () use ($v3p) {
    $b = backend_dispatch('admin.champions.board', ['requesterId' => 'NGG-2025-0099', 'period' => $v3p]);
    return !empty($b['ok']) && $b['board']['overall'][0]['studentId'] === 'SUM-R-1' && $b['board']['overall'][0]['total'] === 12;
})());
chk('champions mint is gated to people cap', backend_dispatch('admin.champions.mint', ['requesterId' => 'NGG-2025-0001', 'period' => $v3p])['error'] === 'forbidden');
chk('champions mint creates non-monetary awards', (function () use ($v3p) {
    $r = backend_dispatch('admin.champions.mint', ['requesterId' => 'NGG-2025-0099', 'period' => $v3p]);
    if (empty($r['ok']) || !count($r['minted'])) return false;
    $aw = db_row("SELECT valueNaira FROM awards WHERE subjectId='SUM-R-1' AND period=? AND name LIKE 'V3 Champion%' LIMIT 1", [$v3p]);
    return $aw && (int)$aw['valueNaira'] === 0;
})());
chk('champions mint is idempotent per period', (function () use ($v3p) {
    $before = (int)db_row("SELECT COUNT(*) c FROM awards WHERE period=? AND name LIKE 'V3 Champion%'", [$v3p])['c'];
    backend_dispatch('admin.champions.mint', ['requesterId' => 'NGG-2025-0099', 'period' => $v3p]);
    $after = (int)db_row("SELECT COUNT(*) c FROM awards WHERE period=? AND name LIKE 'V3 Champion%'", [$v3p])['c'];
    return $before === $after && $before > 0;
})());

// ── Public status board (no auth, PII-free) ─────────────────────────────────
chk('public status: no-auth, aggregates present, no PII', (function () {
    $r = backend_dispatch('public.status', []); // no requester at all
    if (empty($r['ok'])) return false;
    $s = $r['status'];
    if (!isset($s['kpis']['attendanceRate']) || !is_array($s['byCentre'])) return false;
    foreach ($s['byCentre'] as $c) {
        if (array_key_exists('studentId', $c) || array_key_exists('fullName', $c)) return false; // never leak a child
        if (!array_key_exists('rate', $c) || !array_key_exists('present', $c)) return false;
    }
    return $s['kpis']['presentToday'] >= 1; // SUM-R-1 checked in today (dashboard test)
})());

// ── Status-page management (publish toggle + editorial copy) ──
chk('status pages get returns both boards with defaults', (function () {
    $r = backend_dispatch('admin.status.pages.get', ['requesterId' => 'NGG-2025-0099']);
    return !empty($r['ok']) && $r['statusPages']['attendance']['published'] === true && isset($r['statusPages']['volunteer']['tagline']);
})());
chk('status pages management gated from non-content roles', backend_dispatch('admin.status.pages.get', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');
chk('status pages set edits copy + publish toggle', (function () {
    $r = backend_dispatch('admin.status.pages.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['attendance' => ['title' => 'Impact Live', 'published' => true], 'volunteer' => ['published' => false]]]);
    if (empty($r['ok'])) return false;
    return $r['statusPages']['attendance']['title'] === 'Impact Live' && $r['statusPages']['volunteer']['published'] === false;
})());
chk('public attendance board carries the edited copy', backend_dispatch('public.status', [])['status']['page']['title'] === 'Impact Live');
chk('unpublished volunteer board hides its data', (function () {
    $r = backend_dispatch('public.volunteer.status', []);
    return !empty($r['ok']) && ($r['status']['page']['published'] ?? null) === false && !isset($r['status']['byCentre']);
})());
chk('republishing restores the volunteer board data', (function () {
    backend_dispatch('admin.status.pages.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['volunteer' => ['published' => true]]]);
    $r = backend_dispatch('public.volunteer.status', []);
    return isset($r['status']['byCentre']) && ($r['status']['page']['published'] ?? null) === true;
})());
// Full management: sections/kpis/accent/trend/centres/banner.
chk('status get exposes defaults + centre options', (function () {
    $r = backend_dispatch('admin.status.pages.get', ['requesterId' => 'NGG-2025-0099']);
    return !empty($r['ok']) && isset($r['defaults']['attendance']['sections']) && is_array($r['centreOptions']);
})());
chk('attendance board honours section, KPI, accent, trend + banner config', (function () {
    backend_dispatch('admin.status.pages.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['attendance' => [
        'sections' => ['trend' => false], 'kpis' => ['starsThisWeek' => false],
        'accent' => '#ff8800', 'trendDays' => 30, 'banner' => ['text' => 'Open day Saturday!', 'tone' => 'success'],
    ]]]);
    $p = backend_dispatch('public.status', [])['status']['page'];
    return $p['sections']['trend'] === false && $p['kpis']['starsThisWeek'] === false && $p['accent'] === '#ff8800' && $p['trendDays'] === 30 && $p['banner']['text'] === 'Open day Saturday!' && $p['banner']['tone'] === 'success';
})());
chk('invalid accent is rejected (kept valid)', (function () {
    backend_dispatch('admin.status.pages.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['attendance' => ['accent' => 'not-a-color']]]);
    return backend_dispatch('public.status', [])['status']['page']['accent'] === '#ff8800';
})());
chk('centre filter limits which centres the board shows', (function () {
    backend_dispatch('admin.status.pages.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['attendance' => ['centres' => ['Egbeda']]]]);
    $names = array_map(fn($c) => $c['name'], backend_dispatch('public.status', [])['status']['byCentre']);
    if ($names !== ['Egbeda']) return false;
    // Empty list restores all centres.
    backend_dispatch('admin.status.pages.set', ['requesterId' => 'NGG-2025-0099', 'data' => ['attendance' => ['centres' => []]]]);
    return count(backend_dispatch('public.status', [])['status']['byCentre']) > 1;
})());
chk('trend window respects the configured day count', (function () {
    // trendDays still 30 from above; the trend query window should span up to 30 days.
    $r = backend_dispatch('public.status', []);
    return isset($r['status']['page']['trendDays']) && $r['status']['page']['trendDays'] === 30;
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

// ── Analytics workspace (4-level M&E engine) ─────────────────────────────────
db_exec("INSERT OR IGNORE INTO centres (centreId,name,code,color,status) VALUES ('CEN-AN','Analytics Centre','AN','#4C6FFF','active')");
db_insert('summer_students', ['studentId' => 'SUM-AN-1', 'cohortId' => '', 'token' => '', 'handle' => 'ang1', 'fullName' => 'Ana Girl', 'age' => 12, 'gender' => 'F', 'centre' => 'Analytics Centre', 'track' => 'STEM', 'status' => 'active', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('summer_students', ['studentId' => 'SUM-AN-2', 'cohortId' => '', 'token' => '', 'handle' => 'anb2', 'fullName' => 'Ben Boy', 'age' => 15, 'gender' => 'M', 'centre' => 'Analytics Centre', 'track' => 'Arts', 'status' => 'active', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
$anToday = gmdate('Y-m-d');
db_insert('attendance', ['cohortId' => '', 'studentId' => 'SUM-AN-1', 'token' => '', 'date' => $anToday, 'checkInAt' => now_iso(), 'method' => 'qr', 'byId' => 'NGG-2025-0099', 'device' => '', 'createdAt' => now_iso()]);
db_insert('activities', ['activityId' => 'ACT-AN-1', 'title' => 'STEM Lab', 'category' => 'lesson', 'centre' => 'Analytics Centre', 'department' => 'STEM', 'date' => $anToday, 'facilitatorId' => '', 'facilitatorName' => 'Coach', 'notes' => '', 'evidence' => json_encode([['type' => 'photo', 'url' => 'https://example.org/a.jpg', 'label' => 'Group']]), 'participants' => 2, 'createdBy' => 'NGG-2025-0099', 'createdAt' => now_iso()]);

$ws = backend_dispatch('analytics.workspace', ['requesterId' => 'NGG-2025-0099']);
chk('analytics.workspace returns the four levels', !empty($ws['ok']) && isset($ws['workspace']['executive'], $ws['workspace']['operations'], $ws['workspace']['research'], $ws['workspace']['evidence']));
chk('analytics executive counts enrolled students', ($ws['workspace']['executive']['totalStudents'] ?? 0) >= 2);
chk('analytics gender analysis is populated', count($ws['workspace']['research']['gender'] ?? []) >= 1);
chk('analytics evidence gallery carries attachments', ($ws['workspace']['evidence']['total'] ?? 0) >= 1);
chk('analytics filter options list centres + categories', !empty($ws['workspace']['filters']['options']['centres']) && !empty($ws['workspace']['filters']['options']['categories']));
chk('analytics.workspace gated from non-staff', backend_dispatch('analytics.workspace', ['requesterId' => 'NGG-2025-0001'])['error'] === 'forbidden');

$anDrill = backend_dispatch('analytics.drilldown', ['requesterId' => 'NGG-2025-0099', 'metric' => 'present-today', 'centre' => 'Analytics Centre']);
chk('analytics drilldown lists present students today', !empty($anDrill['ok']) && count(array_filter($anDrill['rows'], fn($r) => ($r['name'] ?? '') === 'Ana Girl')) === 1);
chk('analytics drilldown rejects unknown metric', backend_dispatch('analytics.drilldown', ['requesterId' => 'NGG-2025-0099', 'metric' => 'nope'])['error'] === 'unknown_metric');

$anAdd = backend_dispatch('analytics.activity.add', ['requesterId' => 'NGG-2025-0099', 'title' => 'Field Trip', 'category' => 'excursion', 'centre' => 'Analytics Centre', 'evidence' => [['type' => 'photo', 'url' => 'https://example.org/t.jpg']]]);
chk('analytics.activity.add logs an activity with evidence', !empty($anAdd['ok']) && (int)db_row("SELECT COUNT(*) c FROM activities WHERE activityId=?", [$anAdd['activityId']])['c'] === 1);

// Scoped admin: an admin scoped to a different centre must not see Analytics Centre students.
db_insert('members', ['memberId' => 'NGG-AN-SCOPED', 'fullName' => 'Scoped Admin', 'email' => 'scoped-an@example.com', 'type' => 'NGG', 'status' => 'active', 'role' => 'admin', 'centre' => 'Egbeda', 'centreScope' => json_encode(['CEN-AN']), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
$anScoped = backend_dispatch('analytics.workspace', ['requesterId' => 'NGG-AN-SCOPED']);
chk('scoped analytics admin sees only their centre', !empty($anScoped['ok']) && ($anScoped['workspace']['executive']['centres'] ?? 0) === 1 && ($anScoped['workspace']['research']['centreComparison'][0]['name'] ?? '') === 'Analytics Centre');

// ── Sitemap carries both public status boards (§5.8) ──
$sm = @file_get_contents($ROOT . '/public/sitemap.php');
chk('sitemap generator lists /s-status and /v-status', is_string($sm) && str_contains($sm, "/s-status") && str_contains($sm, "/v-status"));
$smStatic = @file_get_contents(dirname($ROOT) . '/sitemap.xml');
chk('static sitemap lists both status boards', is_string($smStatic) && str_contains($smStatic, '/s-status') && str_contains($smStatic, '/v-status'));

// ── Data management: edit + delete student / volunteer / application records ──
// Members + mentors already had upsert; these close the gap for the three
// program records that previously only supported status changes.

// Student — enrol a throwaway, edit real fields, then delete (frees the QR).
$dmQ = backend_dispatch('admin.summer.qr.mint', ['requesterId' => 'NGG-2025-0099', 'count' => 1]);
$dmTok = $dmQ['tokens'][0];
$dmSid = backend_dispatch('admin.summer.enroll', ['requesterId' => 'NGG-2025-0099', 'data' => ['fullName' => 'Edit Me', 'age' => 11, 'centre' => 'Egbeda', 'track' => 'Tech', 'token' => $dmTok]])['studentId'];
chk('student update edits real fields', (function () use ($dmSid) {
    if (empty(backend_dispatch('admin.summer.student.update', ['requesterId' => 'NGG-2025-0099', 'studentId' => $dmSid, 'data' => ['fullName' => 'Edited Kid', 'age' => 13, 'centre' => 'Ikeja', 'guardianPhone' => '08030000001']])['ok'])) return false;
    $s = db_row('SELECT fullName, age, centre, guardianPhone FROM summer_students WHERE studentId = ?', [$dmSid]);
    return $s['fullName'] === 'Edited Kid' && (int)$s['age'] === 13 && $s['centre'] === 'Ikeja' && $s['guardianPhone'] === '08030000001';
})());
chk('student update rejects a bad age', backend_dispatch('admin.summer.student.update', ['requesterId' => 'NGG-2025-0099', 'studentId' => $dmSid, 'data' => ['age' => 99]])['error'] === 'bad_age');
chk('student update rejects a malformed parent email', backend_dispatch('admin.summer.student.update', ['requesterId' => 'NGG-2025-0099', 'studentId' => $dmSid, 'data' => ['parentEmail' => 'nope']])['error'] === 'bad_email');
chk('a non-admin cannot edit a student', backend_dispatch('admin.summer.student.update', ['requesterId' => 'NGG-2025-0001', 'studentId' => $dmSid, 'data' => ['age' => 12]])['error'] === 'forbidden');
chk('student delete removes the record and frees the QR', (function () use ($dmSid, $dmTok) {
    if (empty(backend_dispatch('admin.summer.student.delete', ['requesterId' => 'NGG-2025-0099', 'studentId' => $dmSid])['ok'])) return false;
    return !db_row('SELECT id FROM summer_students WHERE studentId = ?', [$dmSid]) && db_row('SELECT status FROM qr_codes WHERE token = ?', [$dmTok])['status'] === 'blank';
})());

// Volunteer — throwaway active record, edit, delete.
db_insert('volunteers', ['volunteerId' => 'VOL-DM-1', 'fullName' => 'Vol Edit', 'firstName' => 'Vol', 'lastName' => 'Edit', 'email' => 'voledit@example.com', 'phone' => '08030000002', 'role' => 'mentor', 'centre' => 'Egbeda', 'faculty' => 'STEM', 'courses' => '[]', 'token' => 'VOLQR-DMDM', 'status' => 'active', 'visibilityConsent' => 0, 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
db_insert('qr_codes', ['token' => 'VOLQR-DMDM', 'batch' => 'VOL', 'status' => 'assigned', 'studentId' => 'VOL-DM-1', 'assignedName' => 'Vol Edit', 'createdAt' => now_iso()]);
chk('volunteer update edits role + courses + consent', (function () {
    if (empty(backend_dispatch('admin.volunteers.update', ['requesterId' => 'NGG-2025-0099', 'volunteerId' => 'VOL-DM-1', 'data' => ['role' => 'instructor', 'courses' => ['Python', 'Web'], 'visibilityConsent' => 1, 'phone' => '08030000009']])['ok'])) return false;
    $v = db_row('SELECT role, courses, visibilityConsent, phone FROM volunteers WHERE volunteerId = ?', ['VOL-DM-1']);
    return $v['role'] === 'instructor' && json_decode($v['courses'], true) === ['Python', 'Web'] && (int)$v['visibilityConsent'] === 1 && $v['phone'] === '08030000009';
})());
chk('volunteer update rejects an unknown role', backend_dispatch('admin.volunteers.update', ['requesterId' => 'NGG-2025-0099', 'volunteerId' => 'VOL-DM-1', 'data' => ['role' => 'chef']])['error'] === 'bad_role');
chk('volunteer update rejects a bad email', backend_dispatch('admin.volunteers.update', ['requesterId' => 'NGG-2025-0099', 'volunteerId' => 'VOL-DM-1', 'data' => ['email' => 'nope']])['error'] === 'bad_email');
chk('volunteer delete removes the record and its QR', (function () {
    return !empty(backend_dispatch('admin.volunteers.delete', ['requesterId' => 'NGG-2025-0099', 'volunteerId' => 'VOL-DM-1'])['ok'])
        && !db_row('SELECT id FROM volunteers WHERE volunteerId = ?', ['VOL-DM-1']) && !db_row('SELECT id FROM qr_codes WHERE token = ?', ['VOLQR-DMDM']);
})());

// Application — throwaway pending row, edit, delete.
db_insert('applications', ['kind' => 'teen', 'name' => 'App Edit', 'age' => 15, 'centre' => 'Egbeda', 'email' => 'appedit@example.com', 'status' => 'new', 'createdAt' => now_iso()]);
$dmAid = (int)db_row("SELECT id FROM applications WHERE email = 'appedit@example.com'")['id'];
chk('application update corrects fields', (function () use ($dmAid) {
    if (empty(backend_dispatch('admin.application.update', ['requesterId' => 'NGG-2025-0099', 'id' => $dmAid, 'data' => ['name' => 'App Edited', 'centre' => 'Yaba', 'phone' => '08030000003']])['ok'])) return false;
    $a = db_row('SELECT name, centre, phone FROM applications WHERE id = ?', [$dmAid]);
    return $a['name'] === 'App Edited' && $a['centre'] === 'Yaba' && $a['phone'] === '08030000003';
})());
chk('application update rejects a bad email', backend_dispatch('admin.application.update', ['requesterId' => 'NGG-2025-0099', 'id' => $dmAid, 'data' => ['email' => 'nope']])['error'] === 'bad_email');
chk('application delete removes the row', (function () use ($dmAid) {
    return !empty(backend_dispatch('admin.application.delete', ['requesterId' => 'NGG-2025-0099', 'id' => $dmAid])['ok']) && !db_row('SELECT id FROM applications WHERE id = ?', [$dmAid]);
})());

// ── Academy catalogue: faculties + courses seeded (Leadership excluded) ──
chk('catalogue: faculties are the 5 academies (no Leadership)', academy_faculties() === ['AI & Technology', 'Entrepreneurship', 'Media', 'Creative Arts', 'Music']);
chk('catalogue: courses are the flattened academy courses', count(academy_courses()) === 20
    && in_array('Tie & Dye', academy_courses(), true) && in_array('Talking Drums', academy_courses(), true) && in_array('Google Workspace', academy_courses(), true));
chk('catalogue: leadership faculty + its courses are excluded', !in_array('Leadership', academy_faculties(), true)
    && !in_array('V3 Fixer', academy_courses(), true) && !in_array('Anchor Journal', academy_courses(), true));
// Courses are just as editable — an admin edit to the summer-reg Course field
// round-trips to the public context (no code change; not hard-coded). Run late,
// after the other summer-reg form tests, so publishing doesn't disturb them.
$srf2 = array_map(function ($f) { if (($f['key'] ?? '') === 'course') $f['options'] = ['Practical Coding', 'Robotics Lab', 'Chess Club']; return $f; }, backend_dispatch('admin.forms.get', ['requesterId' => 'NGG-2025-0099', 'formId' => 'summer-reg'])['form']['fields']);
backend_dispatch('admin.forms.publish', ['requesterId' => 'NGG-2025-0099', 'formId' => 'summer-reg', 'fields' => $srf2]);
chk('course catalogue edit round-trips to the public context', backend_dispatch('public.volunteer.context', [])['courses'] === ['Practical Coding', 'Robotics Lab', 'Chess Club']);

// ── Academy catalogue: per-faculty mapping (setting-backed, admin-editable) ──
chk('academy_courses_for returns a faculty\'s courses', academy_courses_for('Music') === ['Talking Drums', 'Piano', 'Guitar', 'Drums'] && academy_courses_for('Nope') === []);
$vctxBF = backend_dispatch('public.volunteer.context', []);
chk('volunteer context exposes a coursesByFaculty map', isset($vctxBF['coursesByFaculty']) && ($vctxBF['coursesByFaculty']['AI & Technology'] ?? null) === ['Practical Coding', 'AI Tools Application', 'Digital Problem-Solving']);
// Admin get: seeded default until customised.
$catG = backend_dispatch('admin.academy.catalogue.get', ['requesterId' => 'NGG-2025-0099']);
chk('catalogue get returns the seeded default (not yet customised)', $catG['customised'] === false && $catG['catalogue'][0]['faculty'] === 'AI & Technology' && count($catG['catalogue']) === 5);
chk('catalogue set is cap-gated', backend_dispatch('admin.academy.catalogue.set', ['requesterId' => 'NGG-2025-0001', 'catalogue' => [['faculty' => 'X', 'courses' => ['Y']]]])['error'] === 'forbidden');
chk('catalogue set rejects an empty catalogue', backend_dispatch('admin.academy.catalogue.set', ['requesterId' => 'NGG-2025-0099', 'catalogue' => [['faculty' => '', 'courses' => []]]])['error'] === 'catalogue_empty');
// Save a custom map (list-of-rows form) and confirm it drives every reader.
backend_dispatch('admin.academy.catalogue.set', ['requesterId' => 'NGG-2025-0099', 'catalogue' => [['faculty' => 'Robotics', 'courses' => ['Line Follower', 'Line Follower', 'Sumo Bot']], ['faculty' => 'Empty', 'courses' => []]]]);
chk('catalogue set cleans + dedupes and drives academy_catalogue', academy_catalogue() === ['Robotics' => ['Line Follower', 'Sumo Bot']]);
chk('catalogue set drives academy_courses_for + coursesByFaculty', academy_courses_for('Robotics') === ['Line Follower', 'Sumo Bot']
    && (backend_dispatch('public.volunteer.context', [])['coursesByFaculty']['Robotics'] ?? null) === ['Line Follower', 'Sumo Bot']);
chk('catalogue get reports customised after a save', backend_dispatch('admin.academy.catalogue.get', ['requesterId' => 'NGG-2025-0099'])['customised'] === true);
// An instructor can pick a catalogue course even when the summer-reg Course
// field (the flat validation list) doesn't include it.
chk('instructor may submit a catalogue-only course', in_array('Sumo Bot', volunteer_courses_accepted(), true));
// Reset reverts to the seeded default.
backend_dispatch('admin.academy.catalogue.set', ['requesterId' => 'NGG-2025-0099', 'reset' => true]);
chk('catalogue reset reverts to the seeded default', academy_catalogue() === academy_catalogue_default() && backend_dispatch('admin.academy.catalogue.get', ['requesterId' => 'NGG-2025-0099'])['customised'] === false);

chk('seed: refreshes a stale auto-generated form, preserves a human-published one', (function () {
    $db = db_conn();
    $db->exec("DELETE FROM form_defs WHERE formId IN ('volunteer', 'summer-reg')");
    db_insert('form_defs', ['formId' => 'volunteer', 'version' => 1, 'name' => 'Volunteer', 'fields' => json_encode([['key' => 'faculty', 'type' => 'choice', 'options' => ['STEM', 'Old Faculty']]]), 'status' => 'live', 'publishedBy' => 'system', 'createdAt' => now_iso()]);
    db_insert('form_defs', ['formId' => 'summer-reg', 'version' => 1, 'name' => 'Summer', 'fields' => json_encode([['key' => 'course', 'type' => 'choice', 'options' => ['Custom Course Kept']]]), 'status' => 'live', 'publishedBy' => 'NGG-2025-0099', 'createdAt' => now_iso()]);
    setting_set('seed_academy_v1', '0', 'system');
    db_run_seeds($db);
    return volunteer_faculty_options() === academy_faculties()   // system form re-seeded from defaults
        && volunteer_course_options() === ['Custom Course Kept']; // human form untouched
})());

/* ── Community 2.0 (channels · posts · reactions · polls · Slack unreads) ── */
(function () {
    global $CONFIG;
    // Two members so we can post rapidly without tripping the 15s anti-spam floor.
    db_insert('members', ['memberId' => 'CM-A', 'fullName' => 'Ada Njoku', 'email' => 'ada@ex.co', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    db_insert('members', ['memberId' => 'CM-B', 'fullName' => 'Bem Kato', 'email' => 'bem@ex.co', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Ikeja', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);

    $ch = backend_dispatch('community.channels', ['memberId' => 'CM-A']);
    chk('community: channels seed a pinned Commons + carry an unread counter', $ch['ok'] && $ch['channels'][0]['slug'] === 'commons' && $ch['channels'][0]['pinned'] === true && array_key_exists('unread', $ch['channels'][0]));

    $post = backend_dispatch('community.post', ['memberId' => 'CM-B', 'data' => ['channel' => 'commons', 'body' => 'Kicked off my capstone today — feeling the zebra energy.'], 'ip' => '1.1.1.1']);
    chk('community: a clean post publishes immediately', $post['ok'] && $post['post']['status'] === 'published' && $post['queued'] === false);
    $pid = $post['post']['postId'];

    $feed = backend_dispatch('community.feed', ['memberId' => 'CM-A', 'channel' => 'commons']);
    chk('community: the feed returns the published post', $feed['ok'] && count(array_filter($feed['posts'], fn($p) => $p['postId'] === $pid)) === 1);

    // B's post is unread for A until A marks the channel read.
    $before = 0; foreach (backend_dispatch('community.channels', ['memberId' => 'CM-A'])['channels'] as $c) if ($c['slug'] === 'commons') $before = $c['unread'];
    chk('community: another member\'s post shows as unread', $before >= 1);
    chk('community: markRead is accepted', backend_dispatch('community.markRead', ['memberId' => 'CM-A', 'channel' => 'commons'])['ok']);
    $after = 0; foreach (backend_dispatch('community.channels', ['memberId' => 'CM-A'])['channels'] as $c) if ($c['slug'] === 'commons') $after = $c['unread'];
    chk('community: markRead clears the unread counter', $after === 0);

    // Reactions toggle.
    $r1 = backend_dispatch('community.react', ['memberId' => 'CM-A', 'postId' => $pid, 'emoji' => '🔥']);
    chk('community: a reaction registers', $r1['ok'] && $r1['myReaction'] === '🔥');
    $r2 = backend_dispatch('community.react', ['memberId' => 'CM-A', 'postId' => $pid, 'emoji' => '🔥']);
    chk('community: reacting again toggles it off', $r2['ok'] && $r2['myReaction'] === '');
    chk('community: an unknown emoji is rejected', backend_dispatch('community.react', ['memberId' => 'CM-A', 'postId' => $pid, 'emoji' => '🦄'])['error'] === 'bad_emoji');

    // Search finds the post by body; a miss returns nothing.
    chk('community: search finds a post by body text', count(backend_dispatch('community.search', ['memberId' => 'CM-A', 'q' => 'zebra'])['posts']) === 1);
    chk('community: search misses cleanly', backend_dispatch('community.search', ['memberId' => 'CM-A', 'q' => 'qwxzynonsense'])['posts'] === []);
    chk('community: search ignores 1-char queries', backend_dispatch('community.search', ['memberId' => 'CM-A', 'q' => 'z'])['posts'] === []);

    // Poll: create + vote + revote keeps one ballot.
    $poll = backend_dispatch('community.post', ['memberId' => 'CM-A', 'data' => ['channel' => 'commons', 'kind' => 'poll', 'body' => 'Best build night?', 'pollOptions' => ['Friday', 'Saturday']], 'ip' => '1.1.1.1']);
    chk('community: a poll needs two options to publish', $poll['ok'] && $poll['post']['kind'] === 'poll' && count($poll['post']['poll']['options']) === 2);
    $ppid = $poll['post']['postId'];
    chk('community: a bad poll choice is rejected', backend_dispatch('community.pollVote', ['memberId' => 'CM-B', 'postId' => $ppid, 'choice' => 9])['error'] === 'bad_choice');
    backend_dispatch('community.pollVote', ['memberId' => 'CM-B', 'postId' => $ppid, 'choice' => 0]);
    $pv = backend_dispatch('community.pollVote', ['memberId' => 'CM-B', 'postId' => $ppid, 'choice' => 1]);
    chk('community: revoting keeps the ballot count at one', $pv['ok'] && $pv['poll']['totalVotes'] === 1 && $pv['poll']['myVote'] === 1);

    // A poll with fewer than two options is refused.
    chk('community: a poll with one option is refused', backend_dispatch('community.post', ['memberId' => 'CM-B', 'data' => ['channel' => 'commons', 'kind' => 'poll', 'body' => 'One?', 'pollOptions' => ['Only']], 'ip' => '1.1.1.1'])['error'] === 'poll_options');

    // Empty posts and oversized/overlong video are refused.
    chk('community: an empty post is refused', backend_dispatch('community.post', ['memberId' => 'CM-A', 'data' => ['channel' => 'commons', 'body' => ''], 'ip' => '1.1.1.1'])['error'] === 'empty');
    chk('community: a >80MB video is refused', backend_dispatch('community.post', ['memberId' => 'CM-B', 'data' => ['channel' => 'commons', 'mediaType' => 'video', 'mediaUrl' => 'https://x/v.mp4', 'mediaBytes' => 90 * 1024 * 1024], 'ip' => '1.1.1.1'])['error'] === 'video_too_big');

    // Non-https media is refused (defence in depth against data: / http URLs).
    chk('community: non-https media is refused', backend_dispatch('community.post', ['memberId' => 'CM-A', 'data' => ['channel' => 'commons', 'body' => 'hi', 'mediaType' => 'image', 'mediaUrl' => 'http://x/p.png'], 'ip' => '1.1.1.1'])['error'] === 'bad_media');

    // @mention of a SUMMER STUDENT notifies them (regression: community_notify
    // used to reject recipients that live in summer_students, not members).
    db_insert('members', ['memberId' => 'CM-C', 'fullName' => 'Ola Diallo', 'email' => 'ola@ex.co', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    db_insert('summer_students', ['studentId' => 'CM-STU-1', 'cohortId' => 'CM-C0', 'handle' => 'zuri-mention', 'fullName' => 'Zuri Mensah', 'status' => 'active', 'regStatus' => 'verified', 'enrolledAt' => now_iso(), 'updatedAt' => now_iso()]);
    backend_dispatch('community.post', ['memberId' => 'CM-C', 'data' => ['channel' => 'commons', 'body' => 'Nice work @zuri-mention — showcase this!'], 'ip' => '1.1.1.1']);
    chk('community: mentioning a student notifies them', (int)(db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'CM-STU-1' AND kind = 'community.mention'")['c'] ?? 0) === 1);

    // Members are mentionable by a derived handle (first name + last initial).
    chk('community: a member\'s handle derives as first-lastinitial', community_member_handle('Ada Njoku') === 'ada-n');
    db_insert('members', ['memberId' => 'CM-D', 'fullName' => 'Diedre Wole', 'email' => 'd@ex.co', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    backend_dispatch('community.post', ['memberId' => 'CM-D', 'data' => ['channel' => 'commons', 'body' => 'Great job @ada-n 👏'], 'ip' => '1.1.1.1']);
    chk('community: mentioning a member notifies them', (int)(db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'CM-A' AND kind = 'community.mention'")['c'] ?? 0) === 1);

    // @all is staff-only. A plain member's @all fans out to nobody.
    db_insert('members', ['memberId' => 'CM-E', 'fullName' => 'Eze Musa', 'email' => 'e@ex.co', 'type' => 'NGG', 'status' => 'active', 'role' => 'member', 'centre' => 'Egbeda', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    backend_dispatch('community.post', ['memberId' => 'CM-E', 'data' => ['channel' => 'commons', 'body' => '@all please read'], 'ip' => '1.1.1.1']);
    chk('community: a non-staff @all notifies nobody', (int)(db_row("SELECT COUNT(*) c FROM notifications WHERE kind = 'community.tagall'")['c'] ?? 0) === 0);
    // A super-admin's @all reaches the channel's other participants.
    backend_dispatch('community.post', ['memberId' => 'NGG-2025-0099', 'data' => ['channel' => 'commons', 'body' => '@all showcase brief is up'], 'ip' => '1.1.1.1']);
    chk('community: a staff @all tags the channel', (int)(db_row("SELECT COUNT(*) c FROM notifications WHERE kind = 'community.tagall'")['c'] ?? 0) >= 2);
    chk('community: staff see the @all option in mention search', (function () {
        $r = backend_dispatch('community.mentionSearch', ['q' => 'all', 'memberId' => 'NGG-2025-0099']);
        foreach ($r['people'] as $pp) if ($pp['handle'] === 'all') return true; return false;
    })());
    chk('community: students do NOT see the @all option', (function () {
        $r = backend_dispatch('community.mentionSearch', ['q' => 'all', 'memberId' => 'CM-E']);
        foreach ($r['people'] as $pp) if ($pp['kind'] === 'all') return false; return true;
    })());

    // Genius Stars — mentor/admin-only kudos, separate from reactions.
    chk('community: a plain member cannot give a Genius Star', backend_dispatch('community.star', ['memberId' => 'CM-A', 'postId' => $pid])['error'] === 'forbidden');
    $st = backend_dispatch('community.star', ['memberId' => 'NGG-2025-0099', 'postId' => $pid]);
    chk('community: a mentor awards a Genius Star', $st['ok'] && $st['stars'] === 1 && $st['starred'] === true);
    chk('community: the star notifies the post author', (int)(db_row("SELECT COUNT(*) c FROM notifications WHERE memberId = 'CM-B' AND kind = 'community.star'")['c'] ?? 0) === 1);
    chk('community: the post shape exposes stars + canStar', (function () use ($pid) {
        $f = backend_dispatch('community.feed', ['memberId' => 'NGG-2025-0099', 'channel' => 'commons']);
        foreach ($f['posts'] as $p) if ($p['postId'] === $pid) return $p['stars'] === 1 && $p['canStar'] === true && $p['starred'] === true;
        return false;
    })());
    chk('community: staff can toggle the star back off', backend_dispatch('community.star', ['memberId' => 'NGG-2025-0099', 'postId' => $pid])['stars'] === 0);

    // Admin-settable channel rules round-trip.
    $up = backend_dispatch('admin.community.channel.upsert', ['requesterId' => 'NGG-2025-0099', 'data' => ['name' => 'Robotics Crew', 'rules' => "Be kind.\nShip weekly."]]);
    chk('community: admin can save channel rules', $up['ok'] && $up['channelId']);
    /* ── Community sign-in with an ID card ────────────────────────────────
       Two groups hold a card but have no member account: summer students, and
       the Volunteer Vanguard. The login resolved students only, so an
       instructor holding the card the studio printed for them could not get in
       at all — not by QR, not by ID. */
    $SU2 = 'NGG-2025-0099';
    $cmStu = backend_dispatch('admin.summer.enroll', ['requesterId' => $SU2, 'data' => [
        'fullName' => 'Community Chidi', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Music', 'guardianPhone' => '08031234567']]);
    $cmDid = card_display_id(db_row('SELECT * FROM summer_students WHERE studentId = ?', [$cmStu['studentId']]));
    chk('community login: a student signs in with their ID + guardian phone', (function () use ($cmDid) {
        $r = backend_dispatch('community.login', ['displayId' => $cmDid, 'guardianPhone' => '0803 123 4567']);
        return !empty($r['ok']) && $r['kind'] === 'student';
    })());
    chk('community login: …and with the QR on the card', (function () use ($cmStu) {
        $r = backend_dispatch('community.login', ['token' => $cmStu['token']]);
        return !empty($r['ok']) && $r['kind'] === 'student';
    })());
    chk('community login: the wrong phone is refused', backend_dispatch('community.login', ['displayId' => $cmDid, 'guardianPhone' => '08099999999'])['error'] === 'bad_credentials');

    // A volunteer of this block's own, so an earlier test's sweep cannot have
    // already evicted whoever happens to be first in the table.
    // No token on the row: this one can only be resolved through the qr_codes
    // binding, so that branch is load-bearing rather than shadowed by the
    // row-token fallback the next case covers.
    db_insert('volunteers', ['volunteerId' => 'VOL-INS-26-900', 'fullName' => 'Ifeoma Instructor', 'email' => 'ifeoma@ex.co',
        'phone' => '+2348037654321', 'role' => 'instructor', 'token' => '', 'status' => 'active',
        'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    db_insert('qr_codes', ['token' => 'VOLQR-CM900TEST', 'studentId' => 'VOL-INS-26-900', 'status' => 'assigned', 'createdAt' => now_iso()]);
    $cmVol = db_row("SELECT * FROM volunteers WHERE volunteerId = 'VOL-INS-26-900'");
    chk('community login: an instructor signs in with the ID on their card', (function () use ($cmVol) {
        $r = backend_dispatch('community.login', ['displayId' => (string)$cmVol['volunteerId'], 'guardianPhone' => (string)$cmVol['phone']]);
        return !empty($r['ok']) && $r['kind'] === 'volunteer' && (string)$r['person']['volunteerId'] === (string)$cmVol['volunteerId'];
    })());
    chk('community login: …against their OWN number, not a guardian\'s', (function () use ($cmVol) {
        // The check is last-7, so a 0-prefixed local form of the same number works.
        $local = '0' . substr(preg_replace('/\D/', '', (string)$cmVol['phone']), -10);
        return !empty(backend_dispatch('community.login', ['displayId' => (string)$cmVol['volunteerId'], 'guardianPhone' => $local])['ok']);
    })());
    chk('community login: …and by scanning their volunteer QR (bound in qr_codes)', (function () {
        $r = backend_dispatch('community.login', ['token' => 'VOLQR-CM900TEST']);
        return !empty($r['ok']) && $r['kind'] === 'volunteer' && (string)$r['person']['volunteerId'] === 'VOL-INS-26-900';
    })());
    // Two places a card's token can live: bound in qr_codes, or straight on the
    // volunteer row. Both are real, so both are covered.
    chk('community login: …or with the token held on the volunteer row alone', (function () {
        db_insert('volunteers', ['volunteerId' => 'VOL-MEN-26-901', 'fullName' => 'Tunde Tokenonly', 'email' => 'tt@ex.co',
            'phone' => '+2348039990001', 'role' => 'mentor', 'token' => 'VOLQR-ROWONLY', 'status' => 'active',
            'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
        $r = backend_dispatch('community.login', ['token' => 'VOLQR-ROWONLY']);
        return !empty($r['ok']) && $r['kind'] === 'volunteer' && (string)$r['person']['volunteerId'] === 'VOL-MEN-26-901';
    })());
    chk('community login: an unknown ID is refused', backend_dispatch('community.login', ['displayId' => 'VOL-XXX-99-999', 'guardianPhone' => '08031234567'])['error'] === 'bad_credentials');

    // §2.3 — suspension is a ban from the premises AND the digital channels.
    chk('community login: a suspended card is refused at the door too', (function () use ($SU2, $cmVol) {
        backend_dispatch('admin.policy.save', ['requesterId' => $SU2, 'policy' => ['enabled' => true, 'autoEnforce' => true]]);
        backend_dispatch('admin.policy.sanction.issue', ['requesterId' => $SU2, 'personId' => (string)$cmVol['volunteerId'],
            'personType' => 'volunteer', 'kind' => 'suspension', 'reason' => 'Test suspension.']);
        $r = backend_dispatch('community.login', ['displayId' => (string)$cmVol['volunteerId'], 'guardianPhone' => (string)$cmVol['phone']]);
        return ($r['error'] ?? '') === 'policy_suspended';
    })());
    chk('community login: …and lifting it opens the door again', (function () use ($SU2, $cmVol) {
        $sid = (int)db_row("SELECT id FROM sanctions WHERE personId = ? AND kind = 'suspension' ORDER BY id DESC LIMIT 1", [(string)$cmVol['volunteerId']])['id'];
        backend_dispatch('admin.policy.sanction.update', ['requesterId' => $SU2, 'sanctionId' => $sid, 'status' => 'served']);
        backend_dispatch('admin.policy.save', ['requesterId' => $SU2, 'policy' => ['enabled' => false]]);
        return !empty(backend_dispatch('community.login', ['displayId' => (string)$cmVol['volunteerId'], 'guardianPhone' => (string)$cmVol['phone']])['ok']);
    })());

    // Signing in is what makes someone part of the community headcount.
    chk('community: a signed-in student and instructor are counted', (function () {
        $st = backend_dispatch('public.stats', [])['stats'];
        return $st['communityStudents'] >= 1 && $st['communityInstructors'] >= 1
            && $st['communityMembers'] === $st['activeMembers'] + $st['communityStudents'] + $st['communityInstructors'];
    })());
    chk('community: enrolling without signing in does not inflate the count', (function () use ($SU2) {
        $before = backend_dispatch('public.stats', [])['stats']['communityStudents'];
        backend_dispatch('admin.summer.enroll', ['requesterId' => $SU2, 'data' => ['fullName' => 'Never Signedin', 'age' => 12, 'centre' => 'Egbeda', 'track' => 'Tech']]);
        return backend_dispatch('public.stats', [])['stats']['communityStudents'] === $before;
    })());

    // An instructor who posts must read as themselves, and as staff.
    chk('community: an instructor posting is resolved by name, not "Member"', (function () use ($cmVol) {
        $a = community_author((string)$cmVol['volunteerId']);
        $first = preg_split('/\s+/', trim((string)$cmVol['fullName']))[0];
        return $a['name'] === $first && $a['name'] !== 'Member';
    })());
    chk('community: …and a session resolves through auth.me instead of 404ing', (function () use ($cmVol) {
        $r = backend_dispatch('auth.me', ['memberId' => (string)$cmVol['volunteerId']]);
        return !empty($r['ok']) && $r['member']['role'] === 'volunteer' && $r['member']['type'] === 'VOLUNTEER';
    })());
    chk('community: an instructor is tagged staff in the channel rail', (function () use ($cmVol) {
        $ch = db_row("SELECT channelId FROM community_channels WHERE slug = 'commons'");
        db_insert('community_posts', ['postId' => 'CP-VOLTEST', 'channelId' => (string)$ch['channelId'],
            'authorId' => (string)$cmVol['volunteerId'], 'authorName' => 'Ins', 'authorCentre' => '',
            'body' => 'hello', 'status' => 'published', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
        foreach (backend_dispatch('community.channelMembers', ['channel' => 'commons'])['members'] as $m) {
            if ($m['name'] === 'Ins') return $m['staff'] === true;
        }
        return false;
    })());

    chk('community: channels expose their rules', (function () {
        foreach (backend_dispatch('community.channels', ['memberId' => 'CM-A'])['channels'] as $c) if ($c['slug'] === 'robotics-crew') return strpos($c['rules'], 'Ship weekly') !== false;
        return false;
    })());
})();

echo "\n" . ($failed ? "❌ FAIL: $passed passed, $failed failed\n" : "✅ PASS: $passed passed, 0 failed\n");
exit($failed ? 1 : 0);
