<?php
declare(strict_types=1);

/**
 * Summer School domain — QR-driven attendance & enrollment (Phase 1).
 *
 * Lifecycle: admin mints a batch of blank QR tokens (printed on cards BEFORE
 * anyone enrolls) → a standardized website enrollment binds a token to a new
 * student + a public handle → the profile is reachable by token or handle →
 * attendance is captured by scanning the card. Everything is gated by the
 * 'summer' capability (Summer School coordinator / super_admin) and mirrored to
 * Google Sheets by the export cron.
 */

function summer_slug(string $s): string {
    $s = strtolower(trim($s));
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    return trim($s, '-');
}

/** The active cohort, or null. */
function summer_current_cohort(): ?array {
    return db_row("SELECT * FROM summer_cohorts WHERE status='active' ORDER BY id DESC LIMIT 1") ?: null;
}

/** Ensure there is an active cohort; auto-create one for the current year. */
function summer_ensure_cohort(): array {
    $c = summer_current_cohort();
    if ($c) return $c;
    $year = (int)gmdate('Y');
    $cohortId = 'SUM-' . $year;
    if (!db_row('SELECT id FROM summer_cohorts WHERE cohortId = ?', [$cohortId])) {
        db_insert('summer_cohorts', ['cohortId' => $cohortId, 'year' => $year, 'name' => 'Summer ' . $year, 'startDate' => '', 'endDate' => '', 'status' => 'active', 'createdAt' => now_iso()]);
    }
    return db_row('SELECT * FROM summer_cohorts WHERE cohortId = ?', [$cohortId]);
}

function summer_student_public(array $s, bool $withAttendance = false): array {
    $out = [
        'studentId' => $s['studentId'], 'handle' => $s['handle'], 'fullName' => $s['fullName'],
        'cohortId' => $s['cohortId'], 'centre' => $s['centre'], 'track' => $s['track'],
        'photoUrl' => normalize_image_url($s['photoUrl'] ?? ''), 'status' => $s['status'] ?? 'active',
    ];
    // Archival roll-up (present once a cohort has been archived/compressed).
    if (isset($s['archivedAt']) && $s['archivedAt'] !== null && $s['archivedAt'] !== '') {
        $out['daysPresent'] = (int)($s['daysPresent'] ?? 0);
        $out['attendanceRate'] = (int)($s['attendanceRate'] ?? 0);
        $out['firstSeen'] = $s['firstSeen'] ?? '';
        $out['lastSeen'] = $s['lastSeen'] ?? '';
        $out['archivedAt'] = $s['archivedAt'];
    }
    if ($withAttendance) {
        $rows = db_all('SELECT date, checkInAt, method FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 60', [$s['studentId']]);
        $out['attendance'] = $rows;
        $out['attendanceCount'] = count($rows);
    }
    return $out;
}

// ── Overview ─────────────────────────────────────────────────────────────────
function admin_summer_overview(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $today = gmdate('Y-m-d');
    return ['ok' => true, 'overview' => [
        'cohort'       => $c,
        'students'     => $one("SELECT COUNT(*) c FROM summer_students WHERE cohortId=? AND status='active'", [$c['cohortId']]),
        'qrBlank'      => $one("SELECT COUNT(*) c FROM qr_codes WHERE status='blank'"),
        'qrAssigned'   => $one("SELECT COUNT(*) c FROM qr_codes WHERE status='assigned' AND cohortId=?", [$c['cohortId']]),
        'presentToday' => $one("SELECT COUNT(*) c FROM attendance WHERE cohortId=? AND date=?", [$c['cohortId'], $today]),
        'cohorts'      => db_all("SELECT cohortId, name, year, status FROM summer_cohorts ORDER BY id DESC"),
    ]];
}

// ── Cohorts ──────────────────────────────────────────────────────────────────
function admin_summer_cohort_upsert(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $d = $p['data'] ?? [];
    $cohortId = trim((string)($d['cohortId'] ?? ''));
    $cols = ['name', 'year', 'startDate', 'endDate', 'status'];
    if ($cohortId && db_row('SELECT id FROM summer_cohorts WHERE cohortId = ?', [$cohortId])) {
        db_update('summer_cohorts', db_pick($d, $cols, [], ['year']), ['cohortId' => $cohortId]);
    } else {
        $year = (int)($d['year'] ?? gmdate('Y'));
        $cohortId = $cohortId ?: ('SUM-' . $year);
        db_insert('summer_cohorts', ['cohortId' => $cohortId, 'year' => $year, 'name' => (string)($d['name'] ?? ('Summer ' . $year)), 'startDate' => (string)($d['startDate'] ?? ''), 'endDate' => (string)($d['endDate'] ?? ''), 'status' => (string)($d['status'] ?? 'active'), 'createdAt' => now_iso()]);
    }
    // Only one active cohort at a time.
    if (($d['status'] ?? '') === 'active') db_exec("UPDATE summer_cohorts SET status='archived' WHERE cohortId != ? AND status='active'", [$cohortId]);
    audit('summer.cohort.upsert', $g['requester']['memberId'], $cohortId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'cohortId' => $cohortId];
}

// ── QR minting (batch of blank tokens, printed before enrollment) ────────────
function admin_summer_qr_mint(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $count = max(1, min(500, (int)($p['count'] ?? 0)));
    $c = summer_ensure_cohort();
    $batch = 'B-' . strtoupper(rand_hex(3));
    $made = [];
    for ($i = 0; $i < $count; $i++) {
        $token = 'SUMQR-' . strtoupper(rand_hex(4));
        // Extremely unlikely collision; skip if it happens.
        if (db_row('SELECT id FROM qr_codes WHERE token = ?', [$token])) { $i--; continue; }
        db_insert('qr_codes', ['token' => $token, 'batch' => $batch, 'cohortId' => $c['cohortId'], 'status' => 'blank', 'studentId' => '', 'assignedName' => '', 'createdAt' => now_iso(), 'assignedAt' => '']);
        $made[] = $token;
    }
    audit('summer.qr.mint', $g['requester']['memberId'], $batch, ['count' => count($made)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'batch' => $batch, 'tokens' => $made, 'count' => count($made)];
}

function admin_summer_qr_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = (string)$p['status']; }
    if (!empty($p['batch'])) { $where[] = 'batch = ?'; $params[] = (string)$p['batch']; }
    $sql = 'SELECT token, batch, cohortId, status, studentId, assignedName FROM qr_codes' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 1000';
    return ['ok' => true, 'codes' => db_all($sql, $params)];
}

// ── Standardized enrollment (binds a QR token to a new student) ──────────────
function admin_summer_enroll(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $d = $p['data'] ?? [];
    $name = trim((string)($d['fullName'] ?? ''));
    if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name'];
    $age = (int)($d['age'] ?? 0);
    if ($age < 5 || $age > 19) return ['ok' => false, 'error' => 'bad_age'];
    $c = summer_ensure_cohort();

    // Pick the QR token: an explicit one (must be blank) or the oldest blank.
    $token = trim((string)($d['token'] ?? ''));
    if ($token !== '') {
        $qr = db_row("SELECT * FROM qr_codes WHERE token = ? LIMIT 1", [$token]);
        if (!$qr) return ['ok' => false, 'error' => 'qr_not_found'];
        if ($qr['status'] !== 'blank') return ['ok' => false, 'error' => 'qr_already_used'];
    } else {
        $qr = db_row("SELECT * FROM qr_codes WHERE status='blank' ORDER BY id ASC LIMIT 1");
        if (!$qr) return ['ok' => false, 'error' => 'no_qr_available'];
        $token = $qr['token'];
    }

    // Sequential studentId within the cohort: SUM-<year>-####
    $n = (int)(db_row('SELECT COUNT(*) c FROM summer_students WHERE cohortId = ?', [$c['cohortId']])['c'] ?? 0) + 1;
    $studentId = $c['cohortId'] . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);

    // Public handle = "the name assigned to the QR" — slug + short suffix, unique.
    $base = summer_slug($name) ?: 'student';
    $handle = $base . '-' . strtolower(substr($token, -4));
    if (db_row('SELECT id FROM summer_students WHERE handle = ?', [$handle])) $handle .= '-' . $n;

    db_insert('summer_students', [
        'studentId' => $studentId, 'cohortId' => $c['cohortId'], 'token' => $token, 'handle' => $handle,
        'fullName' => $name, 'age' => $age, 'centre' => substr((string)($d['centre'] ?? ''), 0, 48),
        'track' => substr((string)($d['track'] ?? ''), 0, 64), 'photoUrl' => (string)($d['photoUrl'] ?? ''),
        'guardianName' => substr((string)($d['guardianName'] ?? ''), 0, 255), 'guardianPhone' => substr((string)($d['guardianPhone'] ?? ''), 0, 48),
        'status' => 'active', 'notes' => substr((string)($d['notes'] ?? ''), 0, 2000),
        'enrolledAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_update('qr_codes', ['status' => 'assigned', 'studentId' => $studentId, 'assignedName' => $handle, 'assignedAt' => now_iso(), 'cohortId' => $c['cohortId']], ['token' => $token]);
    audit('summer.enroll', $g['requester']['memberId'], $studentId, ['token' => $token, 'handle' => $handle], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'studentId' => $studentId, 'handle' => $handle, 'token' => $token];
}

function admin_summer_students_list(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $cohortId = trim((string)($p['cohortId'] ?? '')) ?: $c['cohortId'];
    $where = ['cohortId = ?']; $params = [$cohortId];
    $q = strtolower((string)($p['q'] ?? ''));
    if ($q !== '') { $where[] = '(lower(fullName) LIKE ? OR lower(handle) LIKE ? OR lower(studentId) LIKE ?)'; $like = '%' . $q . '%'; array_push($params, $like, $like, $like); }
    $rows = db_all('SELECT * FROM summer_students WHERE ' . implode(' AND ', $where) . ' ORDER BY id DESC LIMIT 1000', $params);
    return ['ok' => true, 'students' => array_map(fn($s) => summer_student_public($s, true), $rows), 'cohortId' => $cohortId];
}

function admin_summer_student_status(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $studentId = (string)($p['studentId'] ?? '');
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['active', 'withdrawn', 'graduated', 'promoted'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('summer_students', ['status' => $status, 'updatedAt' => now_iso()], ['studentId' => $studentId]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('summer.student.status', $g['requester']['memberId'], $studentId, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Attendance check-in (scan a card) — used by the kiosk in Phase 2 ─────────
function summer_checkin(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $token = trim((string)($p['token'] ?? ''));
    $qr = db_row('SELECT * FROM qr_codes WHERE token = ? LIMIT 1', [$token]);
    if (!$qr || empty($qr['studentId'])) return ['ok' => false, 'error' => 'qr_unassigned'];
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$qr['studentId']]);
    if (!$s) {
        // Volunteer badges check in through the same scanner.
        $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$qr['studentId']]);
        if (!$v) return ['ok' => false, 'error' => 'student_not_found'];
        $today = gmdate('Y-m-d');
        $existing = db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$v['volunteerId'], $today]);
        $already = (bool)$existing;
        if (!$already) {
            db_insert('attendance', ['cohortId' => (string)($qr['cohortId'] ?? ''), 'studentId' => $v['volunteerId'], 'token' => $token, 'date' => $today, 'checkInAt' => now_iso(), 'method' => (string)($p['method'] ?? 'qr'), 'byId' => $g['requester']['memberId'], 'device' => substr((string)($p['device'] ?? ''), 0, 64), 'createdAt' => now_iso()]);
            audit('volunteer.checkin', $g['requester']['memberId'], $v['volunteerId'], ['date' => $today], (string)($p['ip'] ?? ''));
        }
        return ['ok' => true, 'already' => $already, 'student' => volunteer_public($v)];
    }
    $today = gmdate('Y-m-d');
    $existing = db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$s['studentId'], $today]);
    $already = (bool)$existing;
    if (!$already) {
        db_insert('attendance', ['cohortId' => $s['cohortId'], 'studentId' => $s['studentId'], 'token' => $token, 'date' => $today, 'checkInAt' => now_iso(), 'method' => (string)($p['method'] ?? 'qr'), 'byId' => $g['requester']['memberId'], 'device' => substr((string)($p['device'] ?? ''), 0, 64), 'createdAt' => now_iso()]);
        audit('summer.checkin', $g['requester']['memberId'], $s['studentId'], ['date' => $today], (string)($p['ip'] ?? ''));
    }
    return ['ok' => true, 'already' => $already, 'student' => summer_student_public($s)];
}

// ── Attendance analytics (Phase 2 dashboard) ────────────────────────────────
function admin_summer_attendance(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $cid = trim((string)($p['cohortId'] ?? '')) ?: $c['cohortId'];
    $today = gmdate('Y-m-d');
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);

    // Distinct days attendance was taken so far — the denominator for a rate.
    $sessionDays = $one("SELECT COUNT(DISTINCT date) c FROM attendance WHERE cohortId = ?", [$cid]);
    $activeStudents = $one("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active'", [$cid]);
    $presentToday = $one("SELECT COUNT(*) c FROM attendance WHERE cohortId = ? AND date = ?", [$cid, $today]);

    // Last 14 calendar days as a series (present count per day).
    $days = [];
    for ($i = 13; $i >= 0; $i--) {
        $d = gmdate('Y-m-d', time() - $i * 86400);
        $days[] = ['date' => $d, 'present' => $one("SELECT COUNT(*) c FROM attendance WHERE cohortId = ? AND date = ?", [$cid, $d])];
    }

    // Per-student rollup: total present, last seen, attendance rate.
    $students = db_all("SELECT studentId, fullName, handle, track, centre FROM summer_students WHERE cohortId = ? AND status = 'active' ORDER BY fullName", [$cid]);
    $roster = [];
    foreach ($students as $s) {
        $cnt = $one("SELECT COUNT(*) c FROM attendance WHERE studentId = ?", [$s['studentId']]);
        $last = db_row("SELECT date FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 1", [$s['studentId']]);
        $roster[] = [
            'studentId' => $s['studentId'], 'fullName' => $s['fullName'], 'handle' => $s['handle'],
            'track' => $s['track'], 'centre' => $s['centre'], 'present' => $cnt,
            'lastSeen' => $last['date'] ?? '', 'presentToday' => (bool)$one("SELECT COUNT(*) c FROM attendance WHERE studentId = ? AND date = ?", [$s['studentId'], $today]),
            'rate' => $sessionDays ? (int)round($cnt / $sessionDays * 100) : 0,
        ];
    }
    // Lowest attendance first, so at-risk students surface immediately.
    usort($roster, fn($a, $b) => $a['rate'] <=> $b['rate']);
    // At-risk: only meaningful once a few sessions have run.
    $atRisk = $sessionDays >= 3 ? array_values(array_filter($roster, fn($r) => $r['rate'] < 50)) : [];

    $recent = db_all("SELECT a.studentId, a.date, a.checkInAt, a.method, s.fullName FROM attendance a LEFT JOIN summer_students s ON s.studentId = a.studentId WHERE a.cohortId = ? ORDER BY a.checkInAt DESC LIMIT 25", [$cid]);

    return ['ok' => true, 'attendance' => [
        'cohort' => $c, 'today' => $presentToday, 'sessionDays' => $sessionDays,
        'activeStudents' => $activeStudents, 'absentToday' => max(0, $activeStudents - $presentToday),
        'days' => $days, 'roster' => $roster, 'atRisk' => $atRisk, 'recent' => $recent,
    ]];
}

// ── Archival + compression (end of summer) ──────────────────────────────────
/**
 * Roll each student's attendance up onto their row, mark the cohort archived,
 * and (optionally) compress by deleting the now-summarized granular check-ins.
 * The summary keeps the cohort's data reusable for NGG Club enrollment without
 * retaining every scan.
 */
function admin_summer_cohort_archive(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $cohortId = trim((string)($p['cohortId'] ?? '')) ?: summer_ensure_cohort()['cohortId'];
    $compress = !empty($p['compress']);
    $c = db_row('SELECT * FROM summer_cohorts WHERE cohortId = ?', [$cohortId]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];

    $sessionDays = (int)(db_row("SELECT COUNT(DISTINCT date) c FROM attendance WHERE cohortId = ?", [$cohortId])['c'] ?? 0);
    $students = db_all("SELECT studentId FROM summer_students WHERE cohortId = ?", [$cohortId]);
    $now = now_iso();
    foreach ($students as $s) {
        $r = db_row("SELECT COUNT(*) c, MIN(date) f, MAX(date) l FROM attendance WHERE studentId = ?", [$s['studentId']]);
        $cnt = (int)($r['c'] ?? 0);
        db_update('summer_students', [
            'daysPresent' => $cnt,
            'attendanceRate' => $sessionDays ? (int)round($cnt / $sessionDays * 100) : 0,
            'firstSeen' => (string)($r['f'] ?? ''), 'lastSeen' => (string)($r['l'] ?? ''),
            'archivedAt' => $now, 'updatedAt' => $now,
        ], ['studentId' => $s['studentId']]);
    }
    db_update('summer_cohorts', ['status' => 'archived'], ['cohortId' => $cohortId]);

    $purged = 0;
    if ($compress) {
        $purged = (int)(db_row("SELECT COUNT(*) c FROM attendance WHERE cohortId = ?", [$cohortId])['c'] ?? 0);
        db_exec("DELETE FROM attendance WHERE cohortId = ?", [$cohortId]);
    }
    audit('summer.cohort.archive', $g['requester']['memberId'], $cohortId, ['students' => count($students), 'sessionDays' => $sessionDays, 'compress' => $compress, 'purged' => $purged], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'cohortId' => $cohortId, 'students' => count($students), 'sessionDays' => $sessionDays, 'compressed' => $compress, 'purged' => $purged];
}

// ── AI insights (optional; deterministic rule-based fallback) ────────────────
/** A deterministic, always-available summary from the analytics payload. */
function summer_rule_insights(array $a): string {
    $lines = [];
    $lines[] = "· {$a['today']} present today, {$a['absentToday']} absent (of {$a['activeStudents']} active).";
    if ($a['sessionDays'] > 0) {
        $avg = 0; $n = count($a['roster']);
        foreach ($a['roster'] as $r) $avg += (int)$r['rate'];
        $avg = $n ? (int)round($avg / $n) : 0;
        $lines[] = "· Average attendance across {$a['sessionDays']} session day(s): {$avg}%.";
    }
    $risk = count($a['atRisk']);
    if ($risk > 0) {
        $names = array_slice(array_map(fn($r) => $r['fullName'], $a['atRisk']), 0, 3);
        $lines[] = "· {$risk} student(s) at risk (under 50%) — e.g. " . implode(', ', $names) . ". Consider a check-in call.";
    } else {
        $lines[] = "· No students are currently under 50% attendance.";
    }
    // Trend across the last available days.
    $days = $a['days'];
    if (count($days) >= 4) {
        $recent = array_slice($days, -3); $prev = array_slice($days, -6, 3);
        $rs = array_sum(array_column($recent, 'present')); $ps = array_sum(array_column($prev, 'present'));
        if ($rs > $ps) $lines[] = "· Attendance is trending up over the last few days.";
        elseif ($rs < $ps) $lines[] = "· Attendance is dipping over the last few days — worth a nudge.";
    }
    return implode("\n", $lines);
}

function summer_insight_prompt(array $a): string {
    $top = array_slice($a['atRisk'], 0, 8);
    $riskLines = array_map(fn($r) => "{$r['fullName']} ({$r['rate']}%)", $top);
    $series = implode(', ', array_map(fn($d) => $d['date'] . '=' . $d['present'], array_slice($a['days'], -10)));
    return "Cohort {$a['cohort']['cohortId']}. Active students: {$a['activeStudents']}. "
        . "Present today: {$a['today']}, absent: {$a['absentToday']}. Session days so far: {$a['sessionDays']}. "
        . "Recent daily present counts: {$series}. "
        . "At-risk (under 50%): " . (count($riskLines) ? implode('; ', $riskLines) : 'none') . ". "
        . "Give the coordinator 3-5 short, practical bullet points: what's going well, who to follow up with, and one concrete suggestion.";
}

function admin_summer_insights(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $res = admin_summer_attendance($p);
    if (empty($res['ok'])) return $res;
    $a = $res['attendance'];
    $out = ['ok' => true, 'aiConfigured' => ai_enabled('analysis'), 'provider' => '', 'source' => 'rules', 'insight' => summer_rule_insights($a)];
    if (ai_enabled('analysis')) {
        $r = ai_complete(
            "You are an attendance analyst for a youth summer program. Be concise, warm and practical. Reply as 3-5 short bullet points starting with '· '. No preamble.",
            summer_insight_prompt($a), 400, 'analysis'
        );
        if (!empty($r['ok'])) { $out['insight'] = $r['text']; $out['provider'] = $r['provider']; $out['source'] = 'ai'; }
        else { $out['aiError'] = $r['error'] ?? 'ai_failed'; }
    }
    return $out;
}

// ── Public profile (by QR token or handle) ──────────────────────────────────
function public_summer_profile(array $p): array {
    $token = trim((string)($p['token'] ?? ''));
    $handle = trim((string)($p['handle'] ?? ''));
    $s = null;
    if ($token !== '') {
        $qr = db_row('SELECT studentId FROM qr_codes WHERE token = ? LIMIT 1', [$token]);
        if ($qr && !empty($qr['studentId'])) {
            $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$qr['studentId']]);
            if (!$s) {
                // Volunteer tokens serve the volunteer's digital ID here.
                $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$qr['studentId']]);
                if ($v) return ['ok' => true, 'profile' => volunteer_public($v, true)];
            }
        }
    } elseif ($handle !== '') {
        $s = db_row('SELECT * FROM summer_students WHERE handle = ? LIMIT 1', [$handle]);
    }
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'profile' => summer_student_public($s, true)];
}
