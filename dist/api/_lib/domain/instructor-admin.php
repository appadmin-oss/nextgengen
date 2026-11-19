<?php
declare(strict_types=1);
/* ═══════════════════════════════════════════════════════════════════════════
   INSTRUCTOR MANAGEMENT — Mentors & volunteers → Instructors

   An instructor is a volunteer record with role 'instructor' (volunteers): the
   courses they teach (`courses`, JSON), their centre, their safeguarding status
   and their Academy. They are on the timetable by volunteerId
   (timetable_slots.instructorId) and file each class by their member account
   (club_class_sessions.instructorId = volunteers.memberId).

   Before this there was no place to manage them as people: the v1 volunteer
   panel approved and listed them, and nothing answered "who is teaching what,
   are they cleared to be with children, are they turning up, and what has been
   decided about them". This is that place. It adds no second record of a
   person — it reads the volunteer row, the timetable and the session log, and
   writes to the volunteer row and to the people record.

   STATUS of an instructor, derived and never stored twice:
     active       teaching
     on_leave     today falls in [leaveFrom, leaveUntil]; their classes need cover
     offboarded   status 'archived' with offboardedAt: no access, record kept
   COMPLIANCE, each a named issue the screen counts and filters by:
     safeguarding_pending   not cleared — they may not see children
     safeguarding_expired   cleared, but the check has expired
     safeguarding_expiring  expires within INSTR_EXPIRY_WARN_DAYS
     academy                Academy not completed (nor waived)
     no_account             no member account linked, so they cannot file a class
     no_classes             teaches nothing on the timetable
     not_filing             has classes, filed none in INSTR_ACTIVITY_DAYS
     review_overdue         their review date has passed
   ACCOUNTABILITY: every change here is one audit event and one line in
   people_notes (subjectType 'volunteer'), with who and when; staff add notes,
   reviews, warnings and commendations to the same record.

   Access: `people`, centre-scoped by the volunteer's centre, as every other
   volunteer op (admin_volunteer_safeguard).
   ═══════════════════════════════════════════════════════════════════════════ */

const INSTR_ACTIVITY_DAYS = 30;
const INSTR_EXPIRY_WARN_DAYS = 30;
const INSTR_LIST_MAX = 200;
const INSTR_NOTE_KINDS = ['note', 'review', 'warning', 'commendation'];
const INSTR_ISSUES = ['safeguarding_pending', 'safeguarding_expired', 'safeguarding_expiring', 'academy', 'no_account', 'no_classes', 'not_filing', 'review_overdue'];
const INSTR_ISSUE_LABEL = [
    'safeguarding_pending' => 'Safeguarding not cleared', 'safeguarding_expired' => 'Safeguarding check expired',
    'safeguarding_expiring' => 'Safeguarding check expires soon', 'academy' => 'Academy not completed',
    'no_account' => 'No member account, so cannot file classes', 'no_classes' => 'Not on the timetable',
    'not_filing' => 'Has classes but filed none in 30 days', 'review_overdue' => 'Review overdue',
    // A filter, not an issue of its own: either safeguarding issue that keeps them from children.
    'safeguarding' => 'Safeguarding not cleared or expired',
];

function instr_today(): string { return function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'); }

function instr_courses(array $v): array {
    $c = json_decode((string)($v['courses'] ?? ''), true);
    return is_array($c) ? array_values(array_filter(array_map('strval', $c), static fn($x) => trim($x) !== '')) : [];
}

/**
 * Which of these member accounts have completed the Instructor Academy: every
 * required module passed and not lapsed (academy_orientation_state's rule), in
 * one read for the whole roster.
 */
function instr_academy_done(array $memberIds): array {
    $memberIds = array_values(array_unique(array_filter($memberIds)));
    if (!$memberIds || !function_exists('academy_required_ids')) return [];
    $ids = academy_required_ids('instructor');
    if (!$ids) return array_fill_keys($memberIds, true);
    $renew = []; foreach (academy_track('instructor')['modules'] as $m) $renew[(string)$m['id']] = (int)($m['renewDays'] ?? 0);
    $passed = [];
    foreach (array_chunk($memberIds, 400) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT personId, moduleId, passedAt FROM academy_passes WHERE track = 'instructor' AND passedAt <> '' AND personId IN ($in)", $chunk) as $r) {
            $id = (string)$r['moduleId'];
            if (($renew[$id] ?? 0) > 0 && strtotime((string)$r['passedAt']) + $renew[$id] * 86400 < time()) continue;
            $passed[(string)$r['personId']][$id] = true;
        }
    }
    $out = [];
    foreach ($memberIds as $mid) if (!array_diff($ids, array_keys($passed[$mid] ?? []))) $out[$mid] = true;
    return $out;
}

/** The state and the issues of one instructor, from rows already loaded. */
function instr_assess(array $v, int $slots, int $filed, string $lastFiled, string $today): array {
    $offboarded = (string)$v['status'] !== 'active';
    $leave = !$offboarded && (string)($v['leaveFrom'] ?? '') !== '' && (string)$v['leaveFrom'] <= $today
        && ((string)($v['leaveUntil'] ?? '') === '' || (string)$v['leaveUntil'] >= $today);
    $state = $offboarded ? 'offboarded' : ($leave ? 'on_leave' : 'active');
    $issues = [];
    if (!$offboarded) {
        $sg = (string)($v['safeguarding'] ?? 'pending');
        $exp = (string)($v['safeguardingExpires'] ?? '');
        if ($sg !== 'cleared') $issues[] = 'safeguarding_pending';
        elseif ($exp !== '' && $exp < $today) $issues[] = 'safeguarding_expired';
        elseif ($exp !== '' && (strtotime($exp . 'T00:00:00Z') - strtotime($today . 'T00:00:00Z')) / 86400 <= INSTR_EXPIRY_WARN_DAYS) $issues[] = 'safeguarding_expiring';
        if (trim((string)($v['academyClearedAt'] ?? '')) === '' && empty($v['__academyDone'])) $issues[] = 'academy';
        if (trim((string)($v['memberId'] ?? '')) === '') $issues[] = 'no_account';
        if ($slots === 0) $issues[] = 'no_classes';
        elseif (!$leave && $filed === 0) $issues[] = 'not_filing';
        if ((string)($v['reviewDue'] ?? '') !== '' && (string)$v['reviewDue'] < $today) $issues[] = 'review_overdue';
    }
    return ['state' => $state, 'issues' => $issues];
}

/**
 * Every instructor in the reader's centres with their classes, filing and
 * issues — in a fixed number of grouped queries, whatever the roster's size.
 */
function instr_roster(array $requester): array {
    $scope = admin_centre_names_in_scope($requester);
    $where = "role = 'instructor'"; $args = [];
    if ($scope !== null) {
        if (!$scope) return [];
        $where .= ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = $scope;
    }
    $vols = db_all("SELECT * FROM volunteers WHERE $where ORDER BY fullName LIMIT 2000", $args);
    if (!$vols) return [];
    $today = instr_today();
    $since = gmdate('Y-m-d', strtotime($today . 'T00:00:00Z') - INSTR_ACTIVITY_DAYS * 86400);
    $slots = [];
    foreach (db_all("SELECT instructorId, COUNT(*) n FROM timetable_slots WHERE status = 'active' AND instructorId <> '' GROUP BY instructorId") as $r) $slots[(string)$r['instructorId']] = (int)$r['n'];
    $filed = []; $last = [];
    foreach (db_all("SELECT instructorId, COUNT(*) n, MAX(date) last FROM club_class_sessions WHERE instructorId <> '' AND date >= ? GROUP BY instructorId", [$since]) as $r) $filed[(string)$r['instructorId']] = (int)$r['n'];
    foreach (db_all("SELECT instructorId, MAX(date) last FROM club_class_sessions WHERE instructorId <> '' GROUP BY instructorId") as $r) $last[(string)$r['instructorId']] = (string)$r['last'];
    $academy = instr_academy_done(array_map(static fn($v) => trim((string)($v['memberId'] ?? '')), $vols));
    $out = [];
    foreach ($vols as $v) {
        $vid = (string)$v['volunteerId']; $mid = trim((string)($v['memberId'] ?? ''));
        $v['__academyDone'] = $mid !== '' && isset($academy[$mid]);
        $n = $slots[$vid] ?? 0; $f = $mid !== '' ? ($filed[$mid] ?? 0) : 0; $l = $mid !== '' ? ($last[$mid] ?? '') : '';
        $a = instr_assess($v, $n, $f, $l, $today);
        $out[] = ['volunteerId' => $vid, 'fullName' => (string)$v['fullName'], 'email' => (string)($v['email'] ?? ''), 'phone' => (string)($v['phone'] ?? ''),
            'centre' => (string)($v['centre'] ?? ''), 'courses' => instr_courses($v), 'memberId' => $mid, 'photoUrl' => (string)($v['photoUrl'] ?? ''),
            'state' => $a['state'], 'issues' => $a['issues'], 'safeguarding' => (string)($v['safeguarding'] ?? 'pending'), 'safeguardingExpires' => (string)($v['safeguardingExpires'] ?? ''),
            'academy' => trim((string)($v['academyClearedAt'] ?? '')) !== '' || !empty($v['__academyDone']), 'classes' => $n, 'filed30' => $f, 'lastFiled' => $l,
            'leaveUntil' => (string)($v['leaveUntil'] ?? ''), 'reviewDue' => (string)($v['reviewDue'] ?? ''), 'since' => substr((string)($v['createdAt'] ?? ''), 0, 10)];
    }
    return $out;
}

/** admin.instructors.list — the roster, its counts and the classes nobody teaches. Filters above the page. */
function admin_instructors_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $all = instr_roster($g['requester']);
    $counts = ['active' => 0, 'on_leave' => 0, 'offboarded' => 0, 'withIssues' => 0];
    $issueCounts = array_fill_keys(INSTR_ISSUES, 0);
    foreach ($all as $r) {
        $counts[$r['state']]++;
        if ($r['issues']) $counts['withIssues']++;
        foreach ($r['issues'] as $i) $issueCounts[$i]++;
    }
    $rows = $all;
    $state = (string)($p['state'] ?? '');
    if (in_array($state, ['active', 'on_leave', 'offboarded'], true)) $rows = array_values(array_filter($rows, static fn($r) => $r['state'] === $state));
    elseif ($state !== 'all') $rows = array_values(array_filter($rows, static fn($r) => $r['state'] !== 'offboarded'));
    $issue = (string)($p['issue'] ?? '');
    if ($issue === 'any') $rows = array_values(array_filter($rows, static fn($r) => (bool)$r['issues']));
    elseif ($issue === 'safeguarding') $rows = array_values(array_filter($rows, static fn($r) => (bool)array_intersect(['safeguarding_pending', 'safeguarding_expired'], $r['issues'])));
    elseif (in_array($issue, INSTR_ISSUES, true)) $rows = array_values(array_filter($rows, static fn($r) => in_array($issue, $r['issues'], true)));
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    if ($q !== '') $rows = array_values(array_filter($rows, static fn($r) => str_contains(mb_strtolower($r['fullName'] . ' ' . $r['centre'] . ' ' . implode(' ', $r['courses']) . ' ' . $r['volunteerId']), $q)));
    // Who needs attention first: the most issues, then the name.
    usort($rows, static fn($a, $b) => [-count($a['issues']), $a['fullName']] <=> [-count($b['issues']), $b['fullName']]);
    // Classes on the timetable with no instructor, in the reader's centres.
    $scope = admin_centre_names_in_scope($g['requester']);
    $uncovered = db_all("SELECT s.slotId, s.course, s.weekday, s.startTime, c.name centre FROM timetable_slots s JOIN centres c ON c.centreId = s.centreId WHERE s.status = 'active' AND s.instructorId = '' ORDER BY c.name, s.weekday, s.startTime LIMIT 500");
    if ($scope !== null) $uncovered = array_values(array_filter($uncovered, static fn($s) => in_array((string)$s['centre'], $scope, true)));
    $total = count($rows);
    $size = max(1, min(INSTR_LIST_MAX, (int)($p['pageSize'] ?? 50)));
    $page = max(0, (int)($p['page'] ?? 0));
    return ['ok' => true, 'rows' => array_slice($rows, $page * $size, $size), 'total' => $total, 'counts' => $counts, 'issues' => $issueCounts,
        'issueLabels' => INSTR_ISSUE_LABEL, 'uncovered' => $uncovered, 'activityDays' => INSTR_ACTIVITY_DAYS];
}

function instr_gate(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND role = 'instructor' LIMIT 1", [(string)($p['volunteerId'] ?? '')]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($v['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    return $g + ['v' => $v];
}

function instr_record(string $vid, string $kind, string $text, string $actor): void {
    db_insert('people_notes', ['subjectType' => 'volunteer', 'subjectId' => $vid, 'kind' => $kind, 'text' => mb_substr($text, 0, 2000), 'actor' => mb_substr($actor, 0, 80), 'at' => now_iso()]);
}

/** admin.instructors.get — one instructor: who, what they teach, whether they file, and the whole record. */
function admin_instructors_get(array $p): array {
    $g = instr_gate($p); if (!$g['ok']) return $g;
    $v = $g['v']; $vid = (string)$v['volunteerId']; $mid = trim((string)($v['memberId'] ?? ''));
    $today = instr_today();
    $since = gmdate('Y-m-d', strtotime($today . 'T00:00:00Z') - INSTR_ACTIVITY_DAYS * 86400);
    $slots = db_all("SELECT s.slotId, s.course, s.level, s.weekday, s.startTime, s.endTime, s.room, c.name centre FROM timetable_slots s LEFT JOIN centres c ON c.centreId = s.centreId WHERE s.status = 'active' AND s.instructorId = ? ORDER BY s.weekday, s.startTime", [$vid]);
    $sessions = $mid === '' ? [] : db_all("SELECT course, centre, date, rollClosedAt, filedAt FROM club_class_sessions WHERE instructorId = ? ORDER BY date DESC LIMIT 20", [$mid]);
    $filed = $mid === '' ? 0 : (int)db_row('SELECT COUNT(*) c FROM club_class_sessions WHERE instructorId = ? AND date >= ?', [$mid, $since])['c'];
    $last = $sessions[0]['date'] ?? '';
    $v['__academyDone'] = $mid !== '' && isset(instr_academy_done([$mid])[$mid]);
    $a = instr_assess($v, count($slots), $filed, (string)$last, $today);
    $notes = db_all("SELECT kind, text, actor, at FROM people_notes WHERE subjectType = 'volunteer' AND subjectId = ? ORDER BY id DESC LIMIT 100", [$vid]);
    $names = [];
    foreach (array_unique(array_filter(array_column($notes, 'actor'))) as $aid) { $r = db_row('SELECT fullName FROM members WHERE memberId = ?', [$aid]); $names[$aid] = (string)($r['fullName'] ?? $aid); }
    foreach ($notes as &$n) $n['actorName'] = $names[$n['actor']] ?? $n['actor'];
    unset($n);
    return ['ok' => true, 'instructor' => [
            'volunteerId' => $vid, 'fullName' => (string)$v['fullName'], 'email' => (string)($v['email'] ?? ''), 'phone' => (string)($v['phone'] ?? ''),
            'centre' => (string)($v['centre'] ?? ''), 'courses' => instr_courses($v), 'memberId' => $mid, 'photoUrl' => (string)($v['photoUrl'] ?? ''),
            'state' => $a['state'], 'issues' => $a['issues'], 'safeguarding' => (string)($v['safeguarding'] ?? 'pending'),
            'safeguardingCheckedAt' => (string)($v['safeguardingCheckedAt'] ?? ''), 'safeguardingExpires' => (string)($v['safeguardingExpires'] ?? ''),
            'academyClearedAt' => (string)($v['academyClearedAt'] ?? ''), 'academyDone' => !empty($v['__academyDone']), 'reviewDue' => (string)($v['reviewDue'] ?? ''),
            'leaveFrom' => (string)($v['leaveFrom'] ?? ''), 'leaveUntil' => (string)($v['leaveUntil'] ?? ''), 'leaveReason' => (string)($v['leaveReason'] ?? ''),
            'offboardedAt' => (string)($v['offboardedAt'] ?? ''), 'offboardReason' => (string)($v['offboardReason'] ?? ''),
            'since' => substr((string)($v['createdAt'] ?? ''), 0, 10), 'filed30' => $filed, 'lastFiled' => (string)$last],
        'classes' => $slots, 'sessions' => $sessions, 'record' => $notes, 'issueLabels' => INSTR_ISSUE_LABEL,
        'courseOptions' => function_exists('tt_courses') ? tt_courses() : [], 'activityDays' => INSTR_ACTIVITY_DAYS];
}

function instr_date_ok(string $d): bool {
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) === 1 && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4));
}

/**
 * admin.instructors.update — what they teach, and the compliance dates. Only
 * the fields sent change; every change is named in the record.
 */
function admin_instructors_update(array $p): array {
    $g = instr_gate($p); if (!$g['ok']) return $g;
    $v = $g['v']; $vid = (string)$v['volunteerId']; $by = (string)$g['requester']['memberId'];
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $row = []; $said = [];
    if (array_key_exists('courses', $d)) {
        $opts = function_exists('tt_courses') ? tt_courses() : [];
        $want = array_values(array_unique(array_filter(array_map(static fn($x) => trim((string)$x), is_array($d['courses']) ? $d['courses'] : []), static fn($x) => $x !== '')));
        foreach ($want as $c) if ($opts && !in_array($c, $opts, true)) return ['ok' => false, 'error' => 'bad_course', 'detail' => '“' . $c . '” is not a course NGG teaches.'];
        if (count($want) > 12) return ['ok' => false, 'error' => 'too_many_courses', 'detail' => 'At most 12 courses.'];
        // Courses with classes on the timetable stay, or the timetable would name an instructor for a course they no longer teach.
        $taught = array_column(db_all("SELECT DISTINCT course FROM timetable_slots WHERE status = 'active' AND instructorId = ?", [$vid]), 'course');
        $dropped = array_values(array_diff($taught, $want));
        if ($dropped) return ['ok' => false, 'error' => 'course_has_classes', 'detail' => 'They still teach ' . implode(', ', $dropped) . ' on the timetable. Give those classes to someone else first.'];
        $row['courses'] = json_encode($want, JSON_UNESCAPED_UNICODE);
        $said[] = 'Courses: ' . ($want ? implode(', ', $want) : 'none');
    }
    foreach (['safeguardingCheckedAt' => 'Safeguarding checked', 'safeguardingExpires' => 'Safeguarding check expires', 'reviewDue' => 'Next review'] as $k => $label) {
        if (!array_key_exists($k, $d)) continue;
        $val = trim((string)$d[$k]);
        if ($val !== '' && !instr_date_ok($val)) return ['ok' => false, 'error' => 'bad_date', 'field' => $k, 'detail' => $label . ': choose a date.'];
        $row[$k] = $val; $said[] = $label . ': ' . ($val !== '' ? $val : 'cleared');
    }
    if (isset($row['safeguardingCheckedAt'], $row['safeguardingExpires']) && $row['safeguardingCheckedAt'] !== '' && $row['safeguardingExpires'] !== '' && $row['safeguardingExpires'] <= $row['safeguardingCheckedAt'])
        return ['ok' => false, 'error' => 'bad_date', 'field' => 'safeguardingExpires', 'detail' => 'The check must expire after the day it was done.'];
    if (!$row) return ['ok' => true, 'unchanged' => true];
    db_update('volunteers', $row + ['updatedAt' => now_iso()], ['volunteerId' => $vid]);
    instr_record($vid, 'change', implode('. ', $said) . '.', $by);
    audit('instructor.update', $by, $vid, array_keys($row), (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** admin.instructors.leave — leave from a day to a day, with a reason; `clear` ends it. Their classes are listed for cover. */
function admin_instructors_leave(array $p): array {
    $g = instr_gate($p); if (!$g['ok']) return $g;
    $v = $g['v']; $vid = (string)$v['volunteerId']; $by = (string)$g['requester']['memberId'];
    if ((string)$v['status'] !== 'active') return ['ok' => false, 'error' => 'offboarded'];
    if (!empty($p['clear'])) {
        db_update('volunteers', ['leaveFrom' => '', 'leaveUntil' => '', 'leaveReason' => '', 'updatedAt' => now_iso()], ['volunteerId' => $vid]);
        instr_record($vid, 'leave', 'Back from leave.', $by);
        audit('instructor.leave.end', $by, $vid, [], (string)($p['ip'] ?? ''));
        return ['ok' => true];
    }
    $from = trim((string)($p['from'] ?? '')); $until = trim((string)($p['until'] ?? '')); $why = trim((string)($p['reason'] ?? ''));
    if (!instr_date_ok($from)) return ['ok' => false, 'error' => 'bad_date', 'field' => 'from', 'detail' => 'Choose the first day of leave.'];
    if ($until !== '' && (!instr_date_ok($until) || $until < $from)) return ['ok' => false, 'error' => 'bad_date', 'field' => 'until', 'detail' => 'The last day can’t be before the first.'];
    if (mb_strlen($why) < 4) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why, for the record.'];
    db_update('volunteers', ['leaveFrom' => $from, 'leaveUntil' => $until, 'leaveReason' => mb_substr($why, 0, 600), 'updatedAt' => now_iso()], ['volunteerId' => $vid]);
    instr_record($vid, 'leave', 'On leave from ' . $from . ($until !== '' ? ' to ' . $until : ', no end date') . ': ' . $why, $by);
    audit('instructor.leave', $by, $vid, ['from' => $from, 'until' => $until], (string)($p['ip'] ?? ''));
    $classes = db_all("SELECT s.slotId, s.course, s.weekday, s.startTime, c.name centre FROM timetable_slots s LEFT JOIN centres c ON c.centreId = s.centreId WHERE s.status = 'active' AND s.instructorId = ?", [$vid]);
    return ['ok' => true, 'needCover' => $classes];
}

/**
 * admin.instructors.offboard — they stop teaching. Access ends (status
 * 'archived', which every portal gate reads); the record stays. Their classes
 * are taken off them and returned, so the timetable never names someone who
 * has left. Their own account is refused; a reason is required.
 */
function admin_instructors_offboard(array $p): array {
    $g = instr_gate($p); if (!$g['ok']) return $g;
    $v = $g['v']; $vid = (string)$v['volunteerId']; $by = (string)$g['requester']['memberId'];
    if ((string)$v['status'] !== 'active') return ['ok' => false, 'error' => 'already_offboarded'];
    if (trim((string)($v['memberId'] ?? '')) !== '' && (string)$v['memberId'] === $by) return ['ok' => false, 'error' => 'own_account'];
    $why = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($why) < 8) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why they are leaving, for the record.'];
    $classes = db_all("SELECT s.slotId, s.course, s.weekday, s.startTime, c.name centre FROM timetable_slots s LEFT JOIN centres c ON c.centreId = s.centreId WHERE s.status = 'active' AND s.instructorId = ?", [$vid]);
    db_tx(static function () use ($vid, $by, $why) {
        db_update('volunteers', ['status' => 'archived', 'offboardedAt' => now_iso(), 'offboardedBy' => $by, 'offboardReason' => mb_substr($why, 0, 600), 'leaveFrom' => '', 'leaveUntil' => '', 'leaveReason' => '', 'updatedAt' => now_iso()], ['volunteerId' => $vid]);
        db_exec("UPDATE timetable_slots SET instructorId = '' WHERE status = 'active' AND instructorId = ?", [$vid]);
    });
    instr_record($vid, 'offboard', 'Offboarded: ' . $why . ($classes ? ' ' . count($classes) . ' class' . (count($classes) === 1 ? '' : 'es') . ' taken off the timetable for cover.' : ''), $by);
    audit('instructor.offboard', $by, $vid, ['reason' => $why, 'classesUncovered' => count($classes)], (string)($p['ip'] ?? ''));
    if (function_exists('cache_invalidate')) { try { cache_invalidate('timetable'); } catch (Throwable $e) {} }
    return ['ok' => true, 'uncovered' => $classes];
}

/** admin.instructors.reinstate — back from offboarding; their classes are not given back automatically. */
function admin_instructors_reinstate(array $p): array {
    $g = instr_gate($p); if (!$g['ok']) return $g;
    $v = $g['v']; $vid = (string)$v['volunteerId']; $by = (string)$g['requester']['memberId'];
    if ((string)$v['status'] === 'active') return ['ok' => false, 'error' => 'already_active'];
    $why = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($why) < 8) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why they are coming back, for the record.'];
    db_update('volunteers', ['status' => 'active', 'offboardedAt' => '', 'offboardedBy' => '', 'offboardReason' => '', 'updatedAt' => now_iso()], ['volunteerId' => $vid]);
    instr_record($vid, 'reinstate', 'Reinstated: ' . $why, $by);
    audit('instructor.reinstate', $by, $vid, ['reason' => $why], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** admin.instructors.note — a note, a review, a warning or a commendation on their record. */
function admin_instructors_note(array $p): array {
    $g = instr_gate($p); if (!$g['ok']) return $g;
    $kind = (string)($p['kind'] ?? 'note');
    if (!in_array($kind, INSTR_NOTE_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $text = trim((string)($p['text'] ?? ''));
    if (mb_strlen($text) < 4) return ['ok' => false, 'error' => 'text_required', 'detail' => 'Write what happened or what was decided.'];
    $vid = (string)$g['v']['volunteerId']; $by = (string)$g['requester']['memberId'];
    instr_record($vid, $kind, $text, $by);
    // A review sets the next one, when given.
    if ($kind === 'review' && instr_date_ok(trim((string)($p['nextReview'] ?? '')))) {
        db_update('volunteers', ['reviewDue' => trim((string)$p['nextReview']), 'updatedAt' => now_iso()], ['volunteerId' => $vid]);
        instr_record($vid, 'change', 'Next review: ' . trim((string)$p['nextReview']) . '.', $by);
    }
    audit('instructor.note', $by, $vid, ['kind' => $kind], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
