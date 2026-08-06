<?php
/**
 * engagement.php — engagement-rate tracking for volunteers, instructors & mentors.
 *
 * Turns the activity NGG already records into one comparable 0–100% score per
 * person, per role, over a rolling window (default 30 days). Each signal is
 * normalised to 0..1, combined with role-specific weights, ×100, and banded:
 *   engaged ≥ 75  ·  slipping 50–74  ·  at-risk < 50
 *
 * Signals (all directly attributable — no fragile identity guessing except the
 * mentor→member email link, which degrades gracefully):
 *   Volunteers  — attendance_duty completion (assigned vs closed) · points
 *                 earned (volunteer_points) · recency of last activity.
 *   Instructors — course_sessions delivered vs an expected cadence · recency.
 *                 (Learners marked is surfaced as a stat, not yet weighted:
 *                 there is no reliable "scheduled sessions" baseline to score
 *                 delivery against beyond cadence.)
 *   Mentors     — active mentee coverage (mentor_assignments) · touch cadence
 *                 (member_stars the mentor has given) · recency.
 *
 * Read-only; gated by the `audit` (M&E) capability. Op: admin.engagement.
 */

/* ── Tunable weights (each role's weights sum to 1) + targets ───────────── */
const ENG_W_VOL = ['duty' => 0.50, 'points' => 0.25, 'recency' => 0.25];
const ENG_W_INS = ['delivery' => 0.65, 'recency' => 0.35];
const ENG_W_MEN = ['coverage' => 0.40, 'cadence' => 0.35, 'recency' => 0.25];

const ENG_VOL_POINTS_TARGET = 60;   // points in-window that read as "fully active"
const ENG_MENTOR_MENTEES    = 3;    // fallback coverage target when maxMentees unset
const ENG_INS_ROSTER_DAYS   = 180;  // an instructor counts if they taught within this
const ENG_BAND_ENGAGED      = 75;
const ENG_BAND_SLIPPING     = 50;

function _eng_clamp01($x): float { $x = (float)$x; return $x < 0 ? 0.0 : ($x > 1 ? 1.0 : $x); }

function _eng_days_since(?string $date, int $nowTs): ?int {
    $date = trim((string)$date);
    if ($date === '') return null;
    $t = strtotime(substr($date, 0, 10) . ' 00:00:00');
    if ($t === false) return null;
    return (int)floor(($nowTs - $t) / 86400);
}

/** Recency score: 1.0 today, linearly to 0 at the window edge (older → 0). */
function _eng_recency(?string $date, int $nowTs, int $window): float {
    $d = _eng_days_since($date, $nowTs);
    if ($d === null) return 0.0;
    return _eng_clamp01(1 - ($d / max(1, $window)));
}

function _eng_band(int $pct): string {
    if ($pct >= ENG_BAND_ENGAGED) return 'engaged';
    if ($pct >= ENG_BAND_SLIPPING) return 'slipping';
    return 'at_risk';
}

/** Latest of a set of date-ish strings (by prefix YYYY-MM-DD), '' if none. */
function _eng_latest(array $dates): string {
    $best = '';
    foreach ($dates as $d) { $d = substr(trim((string)$d), 0, 10); if ($d !== '' && $d > $best) $best = $d; }
    return $best;
}

function _eng_row(string $role, string $id, string $name, int $pct, array $stats, string $lastActive): array {
    return [
        'role' => $role, 'id' => $id, 'name' => $name !== '' ? $name : $id,
        'engagement' => $pct, 'band' => _eng_band($pct),
        'lastActive' => $lastActive, 'stats' => $stats,
    ];
}

/* ── Volunteers ─────────────────────────────────────────────────────────── */
function _eng_volunteers(string $cutoff, int $nowTs, int $window): array {
    $roster = db_all("SELECT volunteerId, fullName, firstName, lastName, role, centre, createdAt
                      FROM volunteers WHERE status = 'active' ORDER BY fullName");
    if (!$roster) return [];

    $duty = [];
    foreach (db_all("SELECT volunteerId, COUNT(*) assigned,
                            SUM(CASE WHEN completedAt <> '' THEN 1 ELSE 0 END) completed,
                            MAX(date) lastDuty
                     FROM attendance_duty WHERE date >= ? GROUP BY volunteerId", [$cutoff]) as $r) {
        $duty[(string)$r['volunteerId']] = $r;
    }
    $points = [];
    foreach (db_all("SELECT volunteerId, COALESCE(SUM(points),0) pts, MAX(date) lastPts
                     FROM volunteer_points WHERE date >= ? GROUP BY volunteerId", [$cutoff]) as $r) {
        $points[(string)$r['volunteerId']] = $r;
    }

    $rows = [];
    foreach ($roster as $v) {
        $vid = (string)$v['volunteerId'];
        $d = $duty[$vid] ?? null; $p = $points[$vid] ?? null;
        $assigned = (int)($d['assigned'] ?? 0); $completed = (int)($d['completed'] ?? 0);
        $pts = (int)($p['pts'] ?? 0);

        $dutyScore   = $assigned > 0 ? $completed / $assigned : 0.0;
        $pointsScore = _eng_clamp01($pts / ENG_VOL_POINTS_TARGET);
        $lastActive  = _eng_latest([$d['lastDuty'] ?? '', $p['lastPts'] ?? '']);
        $recency     = _eng_recency($lastActive, $nowTs, $window);

        $score = ENG_W_VOL['duty'] * $dutyScore + ENG_W_VOL['points'] * $pointsScore + ENG_W_VOL['recency'] * $recency;
        $name = trim((string)($v['fullName'] ?? '')) ?: trim(((string)($v['firstName'] ?? '')) . ' ' . ((string)($v['lastName'] ?? '')));
        $rows[] = _eng_row('volunteer', $vid, $name, (int)round($score * 100), [
            'centre' => (string)($v['centre'] ?? ''), 'title' => (string)($v['role'] ?? 'Volunteer'),
            'dutyAssigned' => $assigned, 'dutyCompleted' => $completed,
            'dutyRate' => $assigned > 0 ? (int)round($dutyScore * 100) : null,
            'points' => $pts,
        ], $lastActive);
    }
    return $rows;
}

/* ── Instructors ────────────────────────────────────────────────────────── */
function _eng_instructors(string $cutoff, int $nowTs, int $window): array {
    $rosterCut = date('Y-m-d', $nowTs - ENG_INS_ROSTER_DAYS * 86400);
    // Roster = anyone who has logged a class recently; name = their most recent label.
    $roster = db_all("SELECT instructorId, MAX(instructorName) instructorName, MAX(date) lastEver
                      FROM course_sessions WHERE instructorId <> '' AND date >= ?
                      GROUP BY instructorId", [$rosterCut]);
    if (!$roster) return [];

    $win = [];
    foreach (db_all("SELECT instructorId, COUNT(*) delivered, COALESCE(SUM(presentCount),0) present, MAX(date) lastDate
                     FROM course_sessions WHERE date >= ? GROUP BY instructorId", [$cutoff]) as $r) {
        $win[(string)$r['instructorId']] = $r;
    }
    $target = max(1, (int)round($window / 7)); // ~one class a week over the window

    $rows = [];
    foreach ($roster as $ins) {
        $iid = (string)$ins['instructorId'];
        $w = $win[$iid] ?? null;
        $delivered = (int)($w['delivered'] ?? 0);
        $present = (int)($w['present'] ?? 0);

        $deliveryScore = _eng_clamp01($delivered / $target);
        $lastActive = _eng_latest([$w['lastDate'] ?? '', $ins['lastEver'] ?? '']);
        $recency = _eng_recency($lastActive, $nowTs, $window);

        $score = ENG_W_INS['delivery'] * $deliveryScore + ENG_W_INS['recency'] * $recency;
        $rows[] = _eng_row('instructor', $iid, (string)($ins['instructorName'] ?? ''), (int)round($score * 100), [
            'sessions' => $delivered, 'target' => $target, 'learnersMarked' => $present,
        ], $lastActive);
    }
    return $rows;
}

/* ── Mentors ────────────────────────────────────────────────────────────── */
function _eng_mentors(string $cutoff, int $nowTs, int $window): array {
    $roster = db_all("SELECT mentorId, fullName, email, maxMentees, checkedAt, updatedAt
                      FROM mentors WHERE COALESCE(status,'active') <> 'inactive' ORDER BY fullName");
    if (!$roster) return [];

    $mentees = [];
    foreach (db_all("SELECT mentorId, COUNT(*) n FROM mentor_assignments
                     WHERE status = 'active' GROUP BY mentorId") as $r) {
        $mentees[(string)$r['mentorId']] = (int)$r['n'];
    }

    // mentor → member account (by email), so we can count the stars they gave.
    $emails = array_values(array_filter(array_map(fn($m) => strtolower(trim((string)($m['email'] ?? ''))), $roster)));
    $emailToMember = [];
    if ($emails) {
        $ph = implode(',', array_fill(0, count($emails), '?'));
        foreach (db_all("SELECT memberId, LOWER(email) em FROM members WHERE LOWER(email) IN ($ph)", $emails) as $r) {
            $emailToMember[(string)$r['em']] = (string)$r['memberId'];
        }
    }
    $starsBy = [];
    $memberIds = array_values(array_unique(array_filter($emailToMember)));
    if ($memberIds) {
        $ph = implode(',', array_fill(0, count($memberIds), '?'));
        foreach (db_all("SELECT givenById, COUNT(*) stars, MAX(date) lastStar
                         FROM member_stars WHERE date >= ? AND givenById IN ($ph) GROUP BY givenById",
                         array_merge([$cutoff], $memberIds)) as $r) {
            $starsBy[(string)$r['givenById']] = $r;
        }
    }

    $rows = [];
    foreach ($roster as $m) {
        $mid = (string)$m['mentorId'];
        $n = $mentees[$mid] ?? 0;
        $cap = (int)($m['maxMentees'] ?? 0); $target = $cap > 0 ? $cap : ENG_MENTOR_MENTEES;
        $coverageScore = _eng_clamp01($n / $target);

        $memberId = $emailToMember[strtolower(trim((string)($m['email'] ?? '')))] ?? '';
        $st = $memberId !== '' ? ($starsBy[$memberId] ?? null) : null;
        $stars = (int)($st['stars'] ?? 0);
        $cadenceTarget = max(1, $n); // ~one touch per active mentee over the window
        $cadenceScore = _eng_clamp01($stars / $cadenceTarget);

        $lastActive = _eng_latest([$st['lastStar'] ?? '', $m['checkedAt'] ?? '', $m['updatedAt'] ?? '']);
        $recency = _eng_recency($lastActive, $nowTs, $window);

        $score = ENG_W_MEN['coverage'] * $coverageScore + ENG_W_MEN['cadence'] * $cadenceScore + ENG_W_MEN['recency'] * $recency;
        $rows[] = _eng_row('mentor', $mid, (string)($m['fullName'] ?? ''), (int)round($score * 100), [
            'activeMentees' => $n, 'menteeTarget' => $target, 'stars' => $stars,
            'linked' => $memberId !== '',
        ], $lastActive);
    }
    return $rows;
}

/**
 * admin.engagement — engagement rates across the three portal roles.
 * Params: days (int, default 30, 1..365), role ('volunteer'|'instructor'|'mentor'|'' = all).
 */
function admin_engagement(array $p): array {
    $g = admin_cap_gate($p, 'audit'); if (!$g['ok']) return $g;

    $days = (int)($p['days'] ?? 30);
    if ($days < 1) $days = 1; if ($days > 365) $days = 365;
    $roleFilter = (string)($p['role'] ?? '');

    $nowTs  = strtotime(date('Y-m-d') . ' 23:59:59');
    $cutoff = date('Y-m-d', $nowTs - ($days - 1) * 86400);

    $rows = [];
    if ($roleFilter === '' || $roleFilter === 'volunteer')  $rows = array_merge($rows, _eng_volunteers($cutoff, $nowTs, $days));
    if ($roleFilter === '' || $roleFilter === 'instructor') $rows = array_merge($rows, _eng_instructors($cutoff, $nowTs, $days));
    if ($roleFilter === '' || $roleFilter === 'mentor')     $rows = array_merge($rows, _eng_mentors($cutoff, $nowTs, $days));

    // Highest-risk first is the useful default ordering for staff.
    usort($rows, fn($a, $b) => $a['engagement'] <=> $b['engagement']);

    $summary = [];
    foreach (['volunteer', 'instructor', 'mentor'] as $role) {
        $r = array_values(array_filter($rows, fn($x) => $x['role'] === $role));
        $count = count($r);
        $avg = $count ? (int)round(array_sum(array_map(fn($x) => $x['engagement'], $r)) / $count) : 0;
        $atRisk = count(array_filter($r, fn($x) => $x['band'] === 'at_risk'));
        $summary[$role] = ['count' => $count, 'avg' => $avg, 'atRisk' => $atRisk];
    }

    return [
        'ok' => true,
        'window' => ['days' => $days, 'from' => $cutoff, 'to' => date('Y-m-d')],
        'generatedAt' => date('c'),
        'weights' => ['volunteer' => ENG_W_VOL, 'instructor' => ENG_W_INS, 'mentor' => ENG_W_MEN],
        'bands' => ['engaged' => ENG_BAND_ENGAGED, 'slipping' => ENG_BAND_SLIPPING],
        'summary' => $summary,
        'rows' => $rows,
    ];
}
