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

function _eng_row(string $role, string $id, string $name, string $centre, int $pct, array $stats, string $lastActive): array {
    return [
        'role' => $role, 'id' => $id, 'name' => $name !== '' ? $name : $id, 'centre' => $centre,
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
        $rows[] = _eng_row('volunteer', $vid, $name, (string)($v['centre'] ?? ''), (int)round($score * 100), [
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
    // Dominant centre in-window (an instructor may teach across centres; the
    // snapshot needs one centre per person, so we take where they taught most).
    $centreBy = [];
    foreach (db_all("SELECT instructorId, centre, COUNT(*) c FROM course_sessions
                     WHERE date >= ? GROUP BY instructorId, centre", [$cutoff]) as $r) {
        $iid = (string)$r['instructorId'];
        if (!isset($centreBy[$iid]) || (int)$r['c'] > (int)$centreBy[$iid]['c']) $centreBy[$iid] = ['centre' => (string)$r['centre'], 'c' => (int)$r['c']];
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
        $rows[] = _eng_row('instructor', $iid, (string)($ins['instructorName'] ?? ''), (string)($centreBy[$iid]['centre'] ?? ''), (int)round($score * 100), [
            'sessions' => $delivered, 'target' => $target, 'learnersMarked' => $present,
        ], $lastActive);
    }
    return $rows;
}

/* ── Mentors ────────────────────────────────────────────────────────────── */
function _eng_mentors(string $cutoff, int $nowTs, int $window): array {
    $roster = db_all("SELECT mentorId, fullName, email, centre, maxMentees, checkedAt, updatedAt
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
        $rows[] = _eng_row('mentor', $mid, (string)($m['fullName'] ?? ''), (string)($m['centre'] ?? ''), (int)round($score * 100), [
            'activeMentees' => $n, 'menteeTarget' => $target, 'stars' => $stars,
            'linked' => $memberId !== '',
        ], $lastActive);
    }
    return $rows;
}

/**
 * Compute engagement rows + summary over a rolling window. Gate-free core,
 * shared by the live admin view and the weekly snapshot job.
 */
function engagement_compute(int $days, string $roleFilter = ''): array {
    if ($days < 1) $days = 1; if ($days > 365) $days = 365;
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
        'window' => ['days' => $days, 'from' => $cutoff, 'to' => date('Y-m-d')],
        'generatedAt' => date('c'),
        'weights' => ['volunteer' => ENG_W_VOL, 'instructor' => ENG_W_INS, 'mentor' => ENG_W_MEN],
        'bands' => ['engaged' => ENG_BAND_ENGAGED, 'slipping' => ENG_BAND_SLIPPING],
        'summary' => $summary,
        'rows' => $rows,
    ];
}

/**
 * admin.engagement — live engagement rates across the three portal roles.
 * Params: days (int, default 30, 1..365), role ('volunteer'|'instructor'|'mentor'|'' = all).
 */
function admin_engagement(array $p): array {
    $g = admin_cap_gate($p, 'audit'); if (!$g['ok']) return $g;
    return ['ok' => true] + engagement_compute((int)($p['days'] ?? 30), (string)($p['role'] ?? ''));
}

/** Monday (YYYY-MM-DD, UTC) of the ISO week containing $ts (default now). */
function _eng_week_start(?int $ts = null): string {
    $ts = $ts ?? time();
    $dow = (int)gmdate('N', $ts); // 1=Mon … 7=Sun
    return gmdate('Y-m-d', $ts - ($dow - 1) * 86400);
}

/**
 * Capture this week's engagement — one row per person (carrying their centre)
 * into engagement_snapshots, idempotent per (weekStart, role, personId) so a
 * re-run just refreshes the week in progress. Runs weekly (web-cron +
 * api/tools/engagement-snapshot.php). Uses a trailing 7-day window by default.
 */
function engagement_snapshot_week(?string $weekStart = null, int $windowDays = 7): array {
    $weekStart = $weekStart ?: _eng_week_start();
    $c = engagement_compute($windowDays, '');
    $now = now_iso();
    $written = 0;
    foreach (($c['rows'] ?? []) as $r) {
        db_exec("DELETE FROM engagement_snapshots WHERE weekStart = ? AND role = ? AND personId = ?",
            [$weekStart, (string)$r['role'], (string)$r['id']]);
        db_insert('engagement_snapshots', [
            'weekStart' => $weekStart, 'role' => (string)$r['role'], 'personId' => (string)$r['id'],
            'name' => (string)$r['name'], 'centre' => (string)($r['centre'] ?? ''),
            'engagement' => (int)$r['engagement'], 'band' => (string)$r['band'],
            'windowDays' => $windowDays, 'stats' => json_encode($r['stats'] ?? [], JSON_UNESCAPED_SLASHES),
            'createdAt' => $now,
        ]);
        $written++;
    }
    return ['ok' => true, 'weekStart' => $weekStart, 'written' => $written, 'roles' => $c['summary'] ?? []];
}

/**
 * admin.engagement.trends — weekly engagement history for charting plus a
 * detailed per-member-per-centre table. Params (all optional): weeks (default
 * 12, 1..52), centre, role, personId.
 */
function admin_engagement_trends(array $p): array {
    $g = admin_cap_gate($p, 'audit'); if (!$g['ok']) return $g;
    $weeks  = (int)($p['weeks'] ?? 12); if ($weeks < 1) $weeks = 1; if ($weeks > 52) $weeks = 52;
    $centre = trim((string)($p['centre'] ?? ''));
    $role   = (string)($p['role'] ?? '');
    $person = trim((string)($p['personId'] ?? ''));

    // Most recent $weeks distinct weeks present (LIMIT is a validated int → inlined).
    $allWeeks = array_map(fn($r) => (string)$r['weekStart'],
        db_all("SELECT DISTINCT weekStart FROM engagement_snapshots ORDER BY weekStart DESC LIMIT " . $weeks));
    if (!$allWeeks) return ['ok' => true, 'weeks' => [], 'series' => [], 'detail' => [], 'centres' => [],
                            'filters' => ['weeks' => $weeks, 'centre' => $centre, 'role' => $role, 'personId' => $person]];
    sort($allWeeks); // ascending, for the chart
    $earliest = $allWeeks[0];

    $where = ['weekStart >= ?']; $args = [$earliest];
    if ($centre !== '') { $where[] = 'centre = ?';   $args[] = $centre; }
    if ($role !== '')   { $where[] = 'role = ?';     $args[] = $role; }
    if ($person !== '') { $where[] = 'personId = ?'; $args[] = $person; }
    $w = implode(' AND ', $where);

    // Weekly averages per role (+ a headcount-weighted overall) for the trend lines.
    $agg = db_all("SELECT weekStart, role, COUNT(*) n, AVG(engagement) avg,
                          SUM(CASE WHEN band = 'at_risk' THEN 1 ELSE 0 END) atRisk
                   FROM engagement_snapshots WHERE $w GROUP BY weekStart, role", $args);
    $byWeek = [];
    foreach ($allWeeks as $wk) $byWeek[$wk] = ['weekStart' => $wk, 'all' => null, 'volunteer' => null, 'instructor' => null, 'mentor' => null, 'count' => 0, 'atRisk' => 0];
    $wkParts = [];
    foreach ($agg as $r) {
        $wk = (string)$r['weekStart']; if (!isset($byWeek[$wk])) continue;
        $byWeek[$wk][(string)$r['role']] = (int)round((float)$r['avg']);
        $byWeek[$wk]['count'] += (int)$r['n'];
        $byWeek[$wk]['atRisk'] += (int)$r['atRisk'];
        $wkParts[$wk][] = ['n' => (int)$r['n'], 'avg' => (float)$r['avg']];
    }
    foreach ($wkParts as $wk => $parts) {
        $tot = array_sum(array_map(fn($x) => $x['n'], $parts));
        $byWeek[$wk]['all'] = $tot ? (int)round(array_sum(array_map(fn($x) => $x['n'] * $x['avg'], $parts)) / $tot) : null;
    }
    $series = array_values($byWeek);

    // The detailed grid: per member, per centre, per week (newest first).
    $detail = db_all("SELECT weekStart, role, personId, name, centre, engagement, band
                      FROM engagement_snapshots WHERE $w
                      ORDER BY weekStart DESC, engagement ASC LIMIT 3000", $args);
    $centres = array_map(fn($r) => (string)$r['centre'],
        db_all("SELECT DISTINCT centre FROM engagement_snapshots WHERE centre <> '' ORDER BY centre"));

    return ['ok' => true, 'weeks' => $allWeeks, 'series' => $series, 'detail' => $detail, 'centres' => $centres,
            'filters' => ['weeks' => $weeks, 'centre' => $centre, 'role' => $role, 'personId' => $person]];
}


/* ── Time on the portal ──────────────────────────────────────────────────────
   The page beats once a minute while it is visible AND someone has touched it
   in the last two minutes, so a tab left open overnight counts nothing. The
   server trusts no claim: a beat counts at most PT_BEAT_MAX seconds, beats
   closer than PT_BEAT_GAP apart are dropped (two tabs do not double the time),
   and a day tops out at PT_DAY_MAX per portal. */
const PT_PORTALS  = ['member', 'mentor', 'instructor', 'community', 'club', 'family', 'site', 'other'];
const PT_BEAT_MAX = 75;
const PT_BEAT_GAP = 40;
const PT_DAY_MAX  = 43200;

function portal_time_beat(array $p): array {
    $mid = trim((string)($p['memberId'] ?? ''));
    if ($mid === '') return ['ok' => false, 'error' => 'not_signed_in'];
    $portal = strtolower(trim((string)($p['portal'] ?? '')));
    if (!in_array($portal, PT_PORTALS, true)) $portal = 'other';
    $sec = (int)($p['seconds'] ?? 0);
    if ($sec < 1) return ['ok' => true, 'counted' => 0];
    $sec = min($sec, PT_BEAT_MAX);
    $now = time(); $day = date('Y-m-d', $now); $iso = date('c', $now);
    // Two tabs, two portals: the gap is per person, across portals.
    $last = db_row("SELECT lastAt FROM portal_time WHERE memberId = ? AND day = ? ORDER BY lastAt DESC LIMIT 1", [$mid, $day]);
    if ($last && ($t = strtotime((string)$last['lastAt'])) !== false && $now - $t < PT_BEAT_GAP) return ['ok' => true, 'counted' => 0];
    $row = db_row("SELECT seconds FROM portal_time WHERE memberId = ? AND day = ? AND portal = ?", [$mid, $day, $portal]);
    if ($row) {
        $room = max(0, PT_DAY_MAX - (int)$row['seconds']); $sec = min($sec, $room);
        db_exec("UPDATE portal_time SET seconds = seconds + ?, beats = beats + 1, lastAt = ? WHERE memberId = ? AND day = ? AND portal = ?", [$sec, $iso, $mid, $day, $portal]);
    } else {
        db_insert('portal_time', ['memberId' => $mid, 'day' => $day, 'portal' => $portal, 'seconds' => $sec, 'beats' => 1, 'firstAt' => $iso, 'lastAt' => $iso]);
    }
    return ['ok' => true, 'counted' => $sec];
}

function _pt_median(array $xs): int {
    if (!$xs) return 0; sort($xs); $n = count($xs);
    return (int)round($n % 2 ? $xs[intdiv($n, 2)] : ($xs[$n / 2 - 1] + $xs[$n / 2]) / 2);
}

/**
 * admin.engagement.portal — how long members actually use the portal.
 * Params: days (1..365, default 30), centre, type ('ngg' default | 'all').
 * Centre-scoped staff see their centres only. Minutes are rounded per member.
 */
function admin_engagement_portal(array $p): array {
    $g = admin_cap_gate($p, 'audit'); if (!$g['ok']) return $g;
    $days = (int)($p['days'] ?? 30); if ($days < 1) $days = 30; if ($days > 365) $days = 365;
    $from = date('Y-m-d', time() - ($days - 1) * 86400);
    $centre = trim((string)($p['centre'] ?? ''));
    $all = (string)($p['type'] ?? '') === 'all';

    $where = ["coalesce(m.status,'') NOT IN ('deactivated','deleted','archived')"]; $args = [];
    if (!$all) $where[] = "lower(coalesce(m.type,'')) = 'ngg'";
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) {
        if (!$scope) $scope = ['__none__'];
        $where[] = 'm.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    if ($centre !== '') { $where[] = 'm.centre = ?'; $args[] = $centre; }
    $w = implode(' AND ', $where);

    $people = db_all("SELECT m.memberId, m.fullName, coalesce(m.centre,'') AS centre FROM members m WHERE $w", $args);
    $byId = []; foreach ($people as $r) $byId[(string)$r['memberId']] = $r;

    // One grouped read for the window; everything below is arithmetic.
    $rows = db_all("SELECT t.memberId, t.day, t.portal, t.seconds, t.lastAt FROM portal_time t JOIN members m ON m.memberId = t.memberId
                    WHERE t.day >= ? AND $w", array_merge([$from], $args));

    $per = []; $daily = []; $portals = []; $hours = array_fill(0, 24, 0);
    foreach ($rows as $r) {
        $id = (string)$r['memberId']; $s = (int)$r['seconds'];
        $per[$id] ??= ['seconds' => 0, 'days' => [], 'portals' => [], 'lastAt' => ''];
        $per[$id]['seconds'] += $s; $per[$id]['days'][$r['day']] = true;
        $per[$id]['portals'][$r['portal']] = ($per[$id]['portals'][$r['portal']] ?? 0) + $s;
        if ((string)$r['lastAt'] > $per[$id]['lastAt']) $per[$id]['lastAt'] = (string)$r['lastAt'];
        $daily[$r['day']] ??= ['seconds' => 0, 'members' => []];
        $daily[$r['day']]['seconds'] += $s; $daily[$r['day']]['members'][$id] = true;
        $portals[$r['portal']] ??= ['seconds' => 0, 'members' => []];
        $portals[$r['portal']]['seconds'] += $s; $portals[$r['portal']]['members'][$id] = true;
        if (($t = strtotime((string)$r['lastAt'])) !== false) $hours[(int)date('G', $t)] += $s;
    }

    $total = array_sum(array_map(fn($x) => $x['seconds'], $per));
    $active = count($per);
    $mins = array_map(fn($x) => $x['seconds'] / 60, $per);
    $series = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $d = date('Y-m-d', time() - $i * 86400);
        $series[] = ['day' => $d, 'minutes' => (int)round(($daily[$d]['seconds'] ?? 0) / 60), 'members' => count($daily[$d]['members'] ?? [])];
    }
    $byPortal = [];
    foreach ($portals as $k => $v) $byPortal[] = ['portal' => $k, 'minutes' => (int)round($v['seconds'] / 60), 'members' => count($v['members'])];
    usort($byPortal, fn($a, $b) => $b['minutes'] <=> $a['minutes']);

    $centres = [];
    foreach ($byId as $id => $m) {
        $c = $m['centre'] !== '' ? $m['centre'] : 'No centre';
        $centres[$c] ??= ['centre' => $c, 'members' => 0, 'active' => 0, 'minutes' => 0];
        $centres[$c]['members']++;
        if (isset($per[$id])) { $centres[$c]['active']++; $centres[$c]['minutes'] += (int)round($per[$id]['seconds'] / 60); }
    }
    $centres = array_values($centres);
    foreach ($centres as &$c) $c['reach'] = $c['members'] ? (int)round(100 * $c['active'] / $c['members']) : 0;
    unset($c);
    usort($centres, fn($a, $b) => $b['minutes'] <=> $a['minutes']);

    $list = [];
    foreach ($byId as $id => $m) {
        $x = $per[$id] ?? null;
        if ($x) arsort($x['portals']);
        $list[] = ['memberId' => $id, 'name' => (string)$m['fullName'], 'centre' => (string)$m['centre'],
                   'minutes' => $x ? (int)round($x['seconds'] / 60) : 0, 'daysActive' => $x ? count($x['days']) : 0,
                   'avgPerDay' => $x ? (int)round($x['seconds'] / 60 / max(1, count($x['days']))) : 0,
                   'topPortal' => $x ? (string)array_key_first($x['portals']) : '', 'lastAt' => $x['lastAt'] ?? ''];
    }
    usort($list, fn($a, $b) => [$b['minutes'], $a['name']] <=> [$a['minutes'], $b['name']]);

    return ['ok' => true, 'window' => ['days' => $days, 'from' => $from, 'to' => date('Y-m-d')],
        'totals' => [
            'members' => count($byId), 'active' => $active,
            'reach' => count($byId) ? (int)round(100 * $active / count($byId)) : 0,
            'minutes' => (int)round($total / 60),
            'avgMinutes' => $active ? (int)round($total / 60 / $active) : 0,
            'medianMinutes' => _pt_median($mins),
            'avgDaysActive' => $active ? round(array_sum(array_map(fn($x) => count($x['days']), $per)) / $active, 1) : 0,
            'quiet' => count($byId) - $active,
        ],
        'daily' => $series, 'byPortal' => $byPortal, 'byCentre' => $centres,
        'byHour' => array_map(fn($s) => (int)round($s / 60), $hours),
        'rows' => array_slice($list, 0, 500), 'truncated' => count($list) > 500];
}
