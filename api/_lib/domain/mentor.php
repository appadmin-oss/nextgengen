<?php
declare(strict_types=1);

/**
 * Mentor Portal — a signed-in member whose email is in the `mentors` table
 * (active) supervises a class/department and awards behaviour stars.
 *
 * Scope model (summer school): a mentor covers their centre, optionally narrowed
 * to a department (matched against the student's track). Stars are 1..3, capped
 * at ONE rating per student per day (whichever mentor gets there first), the
 * same ledger-guard shape used by volunteer_points. Each star also drops a
 * positive behaviour_logs row so it shows in the existing M&E trend for free.
 */

function mentor_gate(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]) : null;
    if (!$m) return ['ok' => false, 'error' => 'no_requester'];
    $mentor = !empty($m['email'])
        ? db_row("SELECT * FROM mentors WHERE lower(email) = lower(?) AND status = 'active' LIMIT 1", [(string)$m['email']])
        : null;
    if (!$mentor) return ['ok' => false, 'error' => 'not_a_mentor'];
    return ['ok' => true, 'member' => $m, 'mentor' => $mentor];
}

/** The mentor's class for today — students in their centre (+ department), each
 *  with today's star state so the portal can show what's already been given. */
function mentor_roster(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $mentor = $g['mentor'];
    $centre = trim((string)($mentor['centre'] ?? ''));
    $dept   = trim((string)($mentor['department'] ?? ''));
    $today  = gmdate('Y-m-d');

    $where = "status = 'active'"; $args = [];
    if ($centre !== '') { $where .= ' AND centre = ?'; $args[] = $centre; }
    if ($dept !== '')   { $where .= ' AND track = ?';  $args[] = $dept; }
    $rows = db_all("SELECT studentId, fullName, track, centre, photoUrl FROM summer_students WHERE $where ORDER BY fullName LIMIT 400", $args);

    $students = [];
    foreach ($rows as $r) {
        $star = db_row("SELECT stars, note, category, givenById FROM member_stars WHERE subjectId = ? AND date = ? LIMIT 1", [$r['studentId'], $today]);
        $students[] = [
            'studentId'    => $r['studentId'],
            'fullName'     => $r['fullName'],
            'track'        => $r['track'],
            'photoUrl'     => $r['photoUrl'],
            'starredToday' => $star ? (int)$star['stars'] : 0,
            'note'         => $star['note'] ?? '',
            'byMe'         => $star ? ($star['givenById'] === (string)$g['member']['memberId']) : false,
        ];
    }
    return ['ok' => true, 'today' => $today, 'categories' => BEHAVIOUR_CATEGORIES,
        'mentor' => ['name' => $mentor['fullName'], 'centre' => $centre, 'department' => $dept],
        'students' => $students];
}

/** Award 1..3 stars to a student — assigned mentor / same centre only, one per
 *  student per day. Mirrors into behaviour_logs so the M&E feed sees it. */
function mentor_star_give(array $p): array {
    $g = mentor_gate($p); if (!$g['ok']) return $g;
    $mentor = $g['mentor']; $me = $g['member'];
    $subjectId = (string)($p['subjectId'] ?? '');
    $stars = (int)($p['stars'] ?? 0);
    if ($stars < 1 || $stars > 3) return ['ok' => false, 'error' => 'bad_stars'];
    $s = db_row("SELECT studentId, fullName, centre FROM summer_students WHERE studentId = ? LIMIT 1", [$subjectId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    // Permission: the student must be in the mentor's centre (their class).
    if (trim((string)$mentor['centre']) !== '' && (string)$s['centre'] !== (string)$mentor['centre']) return ['ok' => false, 'error' => 'not_your_centre'];
    $today = gmdate('Y-m-d');
    if (db_row("SELECT id FROM member_stars WHERE subjectId = ? AND date = ? LIMIT 1", [$subjectId, $today])) return ['ok' => false, 'error' => 'already_starred_today'];
    $cat = in_array(($p['category'] ?? ''), BEHAVIOUR_CATEGORIES, true) ? (string)$p['category'] : '';
    $note = substr(trim((string)($p['note'] ?? '')), 0, 300);
    db_insert('member_stars', [
        'subjectId' => $subjectId, 'subjectType' => 'student', 'givenById' => (string)$me['memberId'],
        'stars' => $stars, 'category' => $cat, 'note' => $note, 'centre' => (string)$s['centre'],
        'date' => $today, 'createdAt' => now_iso(),
    ]);
    // Mirror into the qualitative feed (free M&E visibility).
    if (function_exists('rand_hex')) {
        db_insert('behaviour_logs', [
            'logId' => 'BL-' . strtoupper(rand_hex(6)), 'subjectId' => $subjectId, 'subjectName' => (string)$s['fullName'],
            'observerId' => (string)$me['memberId'], 'observerName' => (string)$mentor['fullName'],
            'note' => '★×' . $stars . ($note !== '' ? ' — ' . $note : ''), 'category' => ($cat ?: 'commendation'),
            'severity' => 'positive', 'sentiment' => 'positive', 'aiSource' => 'manual', 'status' => 'open', 'createdAt' => now_iso(),
        ]);
    }
    audit('mentor.star.give', (string)$me['memberId'], $subjectId, ['stars' => $stars, 'category' => $cat], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'stars' => $stars];
}
