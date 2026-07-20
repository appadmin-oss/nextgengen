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
        // Curated projects + public mentor notes (real records, admin-managed).
        if (function_exists('profile_public_extras')) $out = array_merge($out, profile_public_extras('student', (string)$s['studentId']));
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
    if (!empty($p['q'])) { $where[] = '(token LIKE ? OR assignedName LIKE ? OR studentId LIKE ?)'; $like = '%' . (string)$p['q'] . '%'; array_push($params, $like, $like, $like); }
    $sql = 'SELECT token, batch, cohortId, status, studentId, assignedName FROM qr_codes' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 1000';
    $codes = db_all($sql, $params);
    $counts = ['blank' => 0, 'assigned' => 0, 'void' => 0];
    foreach (db_all("SELECT status, COUNT(*) c FROM qr_codes GROUP BY status") as $r) $counts[$r['status']] = (int)$r['c'];
    return ['ok' => true, 'codes' => $codes, 'counts' => $counts];
}

/** Void a card — a lost/damaged QR is retired so it can't be scanned. If it
 *  was bound to a student, the student is detached (they get a fresh card). */
function admin_summer_qr_void(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $token = trim((string)($p['token'] ?? ''));
    $qr = db_row('SELECT * FROM qr_codes WHERE token = ? LIMIT 1', [$token]);
    if (!$qr) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($qr['studentId'])) db_update('summer_students', ['token' => '', 'updatedAt' => now_iso()], ['token' => $token]);
    db_update('qr_codes', ['status' => 'void', 'studentId' => '', 'assignedName' => '', 'assignedAt' => ''], ['token' => $token]);
    audit('summer.qr.void', $g['requester']['memberId'], $token, ['was' => $qr['status'], 'student' => (string)$qr['studentId']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Reassign: move a student's binding onto a different blank card (e.g. a
 *  reprint), or bind a specific blank card to a student by id. */
function admin_summer_qr_reassign(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $token = trim((string)($p['token'] ?? ''));
    $studentId = trim((string)($p['studentId'] ?? ''));
    $qr = db_row('SELECT * FROM qr_codes WHERE token = ? LIMIT 1', [$token]);
    if (!$qr) return ['ok' => false, 'error' => 'not_found'];
    if ($qr['status'] === 'void') return ['ok' => false, 'error' => 'card_void'];
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'student_not_found'];
    // Free the student's old card, free any student on the target card.
    if (!empty($s['token']) && $s['token'] !== $token) db_update('qr_codes', ['status' => 'blank', 'studentId' => '', 'assignedName' => '', 'assignedAt' => ''], ['token' => $s['token']]);
    if (!empty($qr['studentId']) && $qr['studentId'] !== $studentId) db_update('summer_students', ['token' => '', 'updatedAt' => now_iso()], ['studentId' => $qr['studentId']]);
    db_update('qr_codes', ['status' => 'assigned', 'studentId' => $studentId, 'assignedName' => (string)($s['handle'] ?? $s['fullName']), 'assignedAt' => now_iso(), 'cohortId' => (string)$s['cohortId']], ['token' => $token]);
    db_update('summer_students', ['token' => $token, 'updatedAt' => now_iso()], ['studentId' => $studentId]);
    audit('summer.qr.reassign', $g['requester']['memberId'], $token, ['student' => $studentId], (string)($p['ip'] ?? ''));
    return ['ok' => true];
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

    $centre = substr((string)($d['centre'] ?? ''), 0, 48);
    // Waitlist when the centre is at capacity (unless an admin forces it).
    $waitlisted = empty($p['force']) && function_exists('centre_is_full') && centre_is_full($centre, $c['cohortId']);
    db_insert('summer_students', [
        'studentId' => $studentId, 'cohortId' => $c['cohortId'], 'token' => $token, 'handle' => $handle,
        'fullName' => $name, 'age' => $age, 'centre' => $centre,
        'track' => substr((string)($d['track'] ?? ''), 0, 64), 'photoUrl' => (string)($d['photoUrl'] ?? ''),
        'guardianName' => substr((string)($d['guardianName'] ?? ''), 0, 255), 'guardianPhone' => substr((string)($d['guardianPhone'] ?? ''), 0, 48),
        'parentEmail' => substr(trim((string)($d['parentEmail'] ?? '')), 0, 160),
        'status' => $waitlisted ? 'waitlisted' : 'active', 'notes' => substr((string)($d['notes'] ?? ''), 0, 2000),
        'enrolledAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_update('qr_codes', ['status' => 'assigned', 'studentId' => $studentId, 'assignedName' => $handle, 'assignedAt' => now_iso(), 'cohortId' => $c['cohortId']], ['token' => $token]);
    audit('summer.enroll', $g['requester']['memberId'], $studentId, ['token' => $token, 'handle' => $handle, 'waitlisted' => $waitlisted], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'studentId' => $studentId, 'handle' => $handle, 'token' => $token, 'waitlisted' => $waitlisted];
}

/** Bulk enrol students from parsed CSV rows. Each row reuses admin_summer_enroll
 *  (QR binding, capacity/waitlist, parentEmail). Returns per-row results. */
function admin_summer_import(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $rows = is_array($p['rows'] ?? null) ? $p['rows'] : [];
    if (!$rows) return ['ok' => false, 'error' => 'no_rows'];
    if (count($rows) > 500) return ['ok' => false, 'error' => 'too_many_rows'];
    $ok = 0; $failed = 0; $waitlisted = 0; $results = [];
    foreach ($rows as $i => $r) {
        if (!is_array($r)) { $failed++; $results[] = ['row' => $i + 1, 'ok' => false, 'error' => 'bad_row']; continue; }
        $res = admin_summer_enroll(['requesterId' => $p['requesterId'] ?? '', 'ip' => $p['ip'] ?? '', 'data' => [
            'fullName' => (string)($r['fullName'] ?? ''), 'age' => (int)($r['age'] ?? 0),
            'centre' => (string)($r['centre'] ?? ''), 'track' => (string)($r['track'] ?? ''),
            'guardianName' => (string)($r['guardianName'] ?? ''), 'guardianPhone' => (string)($r['guardianPhone'] ?? ''),
            'parentEmail' => (string)($r['parentEmail'] ?? ''),
        ]]);
        if (!empty($res['ok'])) { $ok++; if (!empty($res['waitlisted'])) $waitlisted++; $results[] = ['row' => $i + 1, 'ok' => true, 'studentId' => $res['studentId'], 'waitlisted' => !empty($res['waitlisted'])]; }
        else { $failed++; $results[] = ['row' => $i + 1, 'ok' => false, 'error' => $res['error'] ?? 'failed', 'name' => (string)($r['fullName'] ?? '')]; }
    }
    audit('summer.import', $g['requester']['memberId'], '', ['ok' => $ok, 'failed' => $failed], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'enrolled' => $ok, 'failed' => $failed, 'waitlisted' => $waitlisted, 'results' => $results];
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
    if (!in_array($status, ['active', 'withdrawn', 'graduated', 'promoted', 'waitlisted'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('summer_students', ['status' => $status, 'updatedAt' => now_iso()], ['studentId' => $studentId]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('summer.student.status', $g['requester']['memberId'], $studentId, ['status' => $status], (string)($p['ip'] ?? ''));
    // Graduating a student mints their verifiable completion certificate.
    $cert = null;
    if ($status === 'graduated') { $c = student_maybe_issue_completion_cert($studentId); if ($c) $cert = ['certId' => $c['certId']]; }
    return ['ok' => true, 'cert' => $cert];
}

/** Edit an enrolled student's actual data — name, age, centre, track, guardian
 *  contact, photo, public handle, status. Only supplied fields change; each is
 *  validated the same way enrolment validates them. */
function admin_summer_student_update(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $studentId = (string)($p['studentId'] ?? '');
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $row = ['updatedAt' => now_iso()];
    if (array_key_exists('fullName', $d)) { $name = trim((string)$d['fullName']); if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name']; $row['fullName'] = substr($name, 0, 120); }
    if (array_key_exists('age', $d)) { $age = (int)$d['age']; if ($age < 5 || $age > 19) return ['ok' => false, 'error' => 'bad_age']; $row['age'] = $age; }
    foreach (['centre' => 48, 'track' => 64, 'guardianName' => 255, 'guardianPhone' => 48, 'photoUrl' => 512, 'notes' => 2000] as $f => $max) {
        if (array_key_exists($f, $d)) $row[$f] = substr(trim((string)$d[$f]), 0, $max);
    }
    if (array_key_exists('parentEmail', $d)) {
        $em = trim((string)$d['parentEmail']);
        if ($em !== '' && !filter_var($em, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
        $row['parentEmail'] = substr($em, 0, 160);
    }
    if (array_key_exists('status', $d)) {
        if (!in_array((string)$d['status'], ['active', 'withdrawn', 'graduated', 'promoted', 'waitlisted'], true)) return ['ok' => false, 'error' => 'bad_status'];
        $row['status'] = (string)$d['status'];
    }
    if (array_key_exists('handle', $d)) {   // public identity — keep it slug-safe + unique
        $h = summer_slug((string)$d['handle']);
        if ($h === '') return ['ok' => false, 'error' => 'bad_handle'];
        if (db_row('SELECT id FROM summer_students WHERE handle = ? AND studentId != ? LIMIT 1', [$h, $studentId])) return ['ok' => false, 'error' => 'handle_taken'];
        $row['handle'] = $h;
    }
    db_update('summer_students', $row, ['studentId' => $studentId]);
    audit('summer.student.update', $g['requester']['memberId'], $studentId, ['fields' => array_keys($row)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'studentId' => $studentId];
}

/** Delete an enrolled student. Frees their QR back to the blank pool so it can
 *  be reassigned, and clears their attendance rows. History for other students
 *  is untouched. */
function admin_summer_student_delete(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $studentId = (string)($p['studentId'] ?? '');
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($s['token'])) db_update('qr_codes', ['status' => 'blank', 'studentId' => '', 'assignedName' => '', 'assignedAt' => null], ['token' => (string)$s['token']]);
    db_exec('DELETE FROM attendance WHERE studentId = ?', [$studentId]);
    db_exec('DELETE FROM summer_students WHERE studentId = ?', [$studentId]);
    audit('summer.student.delete', $g['requester']['memberId'], $studentId, ['name' => (string)$s['fullName']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Check-in state emails ────────────────────────────────────────────────────
// On a NEW check-in we send the person a note about where they stand — a nudge
// when they're building the habit, an award-focused message when they're doing
// well and a milestone is close. Sent SYNCHRONOUSLY (the production host has no
// SSH/cron), best-effort, and gated by the `checkin_state_emails` setting so an
// admin can switch it off. Default: on.
function checkin_emails_enabled(): bool {
    $v = setting_raw('checkin_state_emails');
    if ($v === null || $v === '') return true; // default on
    return !in_array(strtolower(trim($v)), ['0', 'off', 'false', 'no'], true);
}

/** Volunteer just checked in → mail them their standing. When a milestone cert
 *  was minted this very check-in, that certificate email already IS the award
 *  message, so we don't double-send here. */
function checkin_volunteer_email(array $v, int $sessions, ?array $cert): void {
    if ($cert) return; // the cert email (award) was already sent this check-in
    if (!checkin_emails_enabled()) return;
    $to = trim((string)($v['email'] ?? ''));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    $first = esc_html(explode(' ', trim((string)($v['fullName'] ?? '')))[0] ?: 'there');
    $game = function_exists('volunteer_game_state')
        ? volunteer_game_state((string)$v['volunteerId'])
        : ['streak' => 0, 'points' => 0];
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $url = $origin . '/volunteer';
    // Next service certificate milestone.
    $next = null; foreach (VOL_MILESTONES as $m) { if ($m > $sessions) { $next = $m; break; } }

    if ($next !== null && ($next - $sessions) <= 2) {
        // Doing well and the award is within reach — make it about the award.
        $left = $next - $sessions;
        $subject = "You're almost at your {$next}-session award";
        $html = email_template([
            'title' => 'The award is close',
            'intro' => "Checked in, {$first} — that's {$sessions} sessions of service. Just " . ($left === 1 ? 'one more' : "{$left} more") . " to unlock your {$next}-session certificate.",
            'bodyHtml' => '<p style="margin:0 0 10px">Show up ' . ($left === 1 ? 'one more time' : "{$left} more times") . ' and the certificate mints automatically — verifiable, yours to share, and it lands right here in your inbox.</p>'
                . (((int)($game['streak'] ?? 0)) > 1 ? '<p style="margin:0;color:#8A93A6;font-size:13px">Current streak: ' . (int)$game['streak'] . ' days · ' . (int)($game['points'] ?? 0) . ' service points.</p>' : ''),
            'ctaLabel' => 'See my progress →', 'ctaUrl' => $url,
        ]);
    } elseif (((int)($game['streak'] ?? 0)) > 1) {
        // On a roll — motivate, keep the streak alive.
        $subject = "Checked in — {$game['streak']}-day streak";
        $html = email_template([
            'title' => 'You showed up',
            'intro' => "Good to see you, {$first}. That's {$sessions} sessions logged and a {$game['streak']}-day streak going.",
            'bodyHtml' => '<p style="margin:0 0 10px">You keep this place in order. Every day you take the roll builds toward your next service award — come back tomorrow and keep it alive.</p>',
            'ctaLabel' => 'See my progress →', 'ctaUrl' => $url,
        ]);
    } else {
        // Gentle nudge — build the habit.
        $subject = 'Checked in — thank you';
        $html = email_template([
            'title' => 'You showed up',
            'intro' => "Good to see you, {$first}. That's {$sessions} sessions of service logged.",
            'bodyHtml' => '<p style="margin:0 0 10px">Consistency is the whole game — come back tomorrow and start a streak. Your service adds up to a certificate you can show anywhere.</p>',
            'ctaLabel' => 'See my progress →', 'ctaUrl' => $url,
        ]);
    }
    @send_mail($to, $subject, $html);
}

/** Student just checked in → mail the guardian a warm note about where their
 *  child stands: a milestone celebration, or a gentle "they made it today". */
function checkin_student_email(array $s, int $days): void {
    if (!checkin_emails_enabled()) return;
    $to = trim((string)($s['parentEmail'] ?? ''));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    $first = esc_html(explode(' ', trim((string)($s['fullName'] ?? '')))[0] ?: 'your child');
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $url = $origin . '/q/' . rawurlencode((string)($s['token'] ?? ''));
    $milestones = [1, 5, 10, 15, 20];

    if ($days === 1) {
        $subject = "{$first} checked in — day one";
        $intro = "{$first} just checked in for their first day at NGG Summer School.";
        $body = "<p style=\"margin:0 0 10px\">We're glad they're here. You'll get a note as they reach each milestone — the goal is a certificate of completion at the end of the programme.</p>";
    } elseif (in_array($days, $milestones, true)) {
        $subject = "{$first} has attended {$days} days";
        $intro = "{$first} just checked in — that's {$days} days at NGG Summer School.";
        $body = "<p style=\"margin:0 0 10px\">Steady attendance is how the growth compounds. {$first} is building the habit that earns the certificate of completion.</p>";
    } else {
        $subject = "{$first} checked in today";
        $intro = "{$first} arrived and checked in at NGG Summer School today.";
        $body = "<p style=\"margin:0 0 10px\">Thank you for getting them here. Every day counts toward the certificate of completion — see the days so far on their page.</p>";
    }
    $html = email_template([
        'title' => 'Checked in', 'intro' => $intro, 'bodyHtml' => $body,
        'ctaLabel' => "Open {$first}'s page →", 'ctaUrl' => $url,
        'footNote' => "You are receiving this because you are {$first}'s guardian at Next Generation Genius.",
    ]);
    @send_mail($to, $subject, $html);
}

// ── Completion certificates (verifiable, guardian-facing) ───────────────────
/** Mint a student's completion certificate once, from their attendance record,
 *  and email the guardian the verifiable link. Returns the cert row or null. */
function student_maybe_issue_completion_cert(string $studentId): ?array {
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$studentId]);
    if (!$s) return null;
    $existing = db_row('SELECT * FROM student_certs WHERE studentId = ? LIMIT 1', [$studentId]);
    if ($existing) return $existing; // once per student

    $days = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$studentId])['c'] ?? 0);
    $sessionDays = (int)(db_row('SELECT COUNT(DISTINCT date) c FROM attendance WHERE cohortId = ?', [(string)$s['cohortId']])['c'] ?? 0);
    $rate = $sessionDays ? (int)round($days / $sessionDays * 100) : 0;
    $certId = 'NGGS-' . strtoupper(rand_hex(5));
    while (db_row('SELECT id FROM student_certs WHERE certId = ?', [$certId])) $certId = 'NGGS-' . strtoupper(rand_hex(5));
    db_insert('student_certs', ['certId' => $certId, 'studentId' => $studentId, 'cohortId' => (string)$s['cohortId'], 'daysPresent' => $days, 'attendanceRate' => $rate, 'issuedAt' => now_iso()]);

    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/cert/' . $certId;
    $first = esc_html(explode(' ', trim((string)$s['fullName']))[0] ?: 'your child');
    if (!empty($s['parentEmail']) && filter_var((string)$s['parentEmail'], FILTER_VALIDATE_EMAIL)) {
        @send_mail((string)$s['parentEmail'], "{$s['fullName']}'s NGG certificate of completion", email_template([
            'title' => 'Certificate of completion',
            'intro' => "Congratulations — {$first} has completed NGG Summer School with {$days} days of attendance.",
            'bodyHtml' => '<p style="margin:0 0 10px">Their certificate is live, verifiable and yours to share — print it or link it anywhere.</p>',
            'ctaLabel' => 'Open the certificate →', 'ctaUrl' => $url,
        ]));
    }
    event_emit('student.completion', ['ref' => $studentId, 'name' => (string)$s['fullName'], 'days' => $days, 'cert' => $certId]);
    return db_row('SELECT * FROM student_certs WHERE certId = ? LIMIT 1', [$certId]);
}

/** Admin: issue completion certs in bulk for a cohort (graduated students, or
 *  all active when none are marked graduated). Returns how many were minted. */
function admin_summer_certs_issue(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $cohortId = trim((string)($p['cohortId'] ?? '')) ?: $c['cohortId'];
    $status = in_array((string)($p['status'] ?? 'graduated'), ['graduated', 'active', 'promoted'], true) ? (string)($p['status'] ?? 'graduated') : 'graduated';
    $rows = db_all('SELECT studentId FROM summer_students WHERE cohortId = ? AND status = ?', [$cohortId, $status]);
    $issued = 0;
    foreach ($rows as $r) {
        if (db_row('SELECT id FROM student_certs WHERE studentId = ?', [$r['studentId']])) continue;
        if (student_maybe_issue_completion_cert((string)$r['studentId'])) $issued++;
    }
    audit('summer.certs.issue', $g['requester']['memberId'], $cohortId, ['status' => $status, 'issued' => $issued], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'issued' => $issued, 'considered' => count($rows)];
}

/** Admin: revoke a certificate (student NGGS- or volunteer NGGV-). */
function admin_cert_revoke(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $certId = strtoupper(trim((string)($p['certId'] ?? '')));
    $on = empty($p['restore']);
    $val = $on ? now_iso() : '';
    $table = strpos($certId, 'NGGV-') === 0 ? 'volunteer_certs' : 'student_certs';
    $n = db_update($table, ['revokedAt' => $val], ['certId' => $certId]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit($on ? 'cert.revoke' : 'cert.restore', $g['requester']['memberId'], $certId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'revoked' => $on];
}

// ── Attendance punctuality settings (per member type) ───────────────────────
/** Resumption time per member type + grace, stored as one JSON blob. When
 *  disabled every check-in is simply 'present'. tzOffset is minutes east of UTC
 *  so a shared host on UTC still flags lateness against local wall-clock. */
function attendance_settings(): array {
    $cfg = setting_get('attendance');
    $p = is_array($cfg) ? $cfg : [];
    $p += ['enabled' => true, 'tzOffset' => 60, 'graceMinutes' => 10, 'resumptionByType' => []];
    $p['resumptionByType'] = (array)$p['resumptionByType'] + ['default' => '09:00', 'student' => '09:00', 'volunteer' => '08:30'];
    return $p;
}

function attendance_settings_save(array $in, string $by): void {
    $clean = [
        'enabled'      => !empty($in['enabled']),
        'tzOffset'     => max(-720, min(840, (int)($in['tzOffset'] ?? 60))),
        'graceMinutes' => max(0, min(180, (int)($in['graceMinutes'] ?? 10))),
    ];
    $byType = [];
    if (isset($in['resumptionByType']) && is_array($in['resumptionByType'])) {
        foreach ($in['resumptionByType'] as $type => $hhmm) {
            $type = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$type));
            $hhmm = trim((string)$hhmm);
            if ($type !== '' && preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $hhmm)) $byType[$type] = $hhmm;
        }
    }
    $clean['resumptionByType'] = $byType;
    setting_set('attendance', $clean, $by);
}

/** {status,lateMinutes} for a check-in of the given member type happening now. */
function attendance_punctuality(string $type): array {
    $cfg = attendance_settings();
    if (empty($cfg['enabled'])) return ['status' => 'present', 'lateMinutes' => 0];
    $byType = $cfg['resumptionByType'];
    $hhmm = (string)($byType[$type] ?? $byType['default'] ?? '09:00');
    [$rh, $rm] = array_pad(array_map('intval', explode(':', $hhmm)), 2, 0);
    $resMin = $rh * 60 + $rm + (int)$cfg['graceMinutes'];
    $localNow = time() + (int)$cfg['tzOffset'] * 60;
    $nowMin = (int)gmdate('G', $localNow) * 60 + (int)gmdate('i', $localNow);
    $late = max(0, $nowMin - $resMin);
    return ['status' => $late > 0 ? 'late' : 'present', 'lateMinutes' => $late];
}

// ── Attendance check-in (scan a card) — used by the kiosk in Phase 2 ─────────
function summer_checkin(array $p): array {
    // A desk-password KIOSK session has no staff member/cap — but the caller
    // (public gate route) has already verified the gate token + kiosk session
    // bound to it, so it passes gateAuthorized. Everyone else must hold the
    // 'summer' cap. byId records who/what took the roll for the audit trail.
    if (!empty($p['gateAuthorized'])) {
        $byId = substr((string)($p['byId'] ?? 'kiosk'), 0, 64) ?: 'kiosk';
    } else {
        $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
        $byId = (string)$g['requester']['memberId'];
    }
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
        $cert = null;
        $punc = attendance_punctuality('volunteer');
        if (!$already) {
            db_insert('attendance', ['cohortId' => (string)($qr['cohortId'] ?? ''), 'studentId' => $v['volunteerId'], 'token' => $token, 'date' => $today, 'checkInAt' => now_iso(), 'method' => (string)($p['method'] ?? 'qr'), 'byId' => $byId, 'device' => substr((string)($p['device'] ?? ''), 0, 64), 'status' => $punc['status'], 'lateMinutes' => $punc['lateMinutes'], 'createdAt' => now_iso()]);
            audit('volunteer.checkin', $byId, $v['volunteerId'], ['date' => $today, 'status' => $punc['status']], (string)($p['ip'] ?? ''));
            // Service ledger: a milestone day mints the certificate right here.
            $sessions = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$v['volunteerId']])['c'] ?? 0);
            $cert = volunteer_maybe_issue_cert($v, $sessions);
            checkin_volunteer_email($v, $sessions, $cert);
        }
        return ['ok' => true, 'already' => $already, 'student' => volunteer_public($v), 'certIssued' => $cert, 'status' => $punc['status'], 'lateMinutes' => $punc['lateMinutes']];
    }
    $today = gmdate('Y-m-d');
    $existing = db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$s['studentId'], $today]);
    $already = (bool)$existing;
    $punc = attendance_punctuality('student');
    if (!$already) {
        db_insert('attendance', ['cohortId' => $s['cohortId'], 'studentId' => $s['studentId'], 'token' => $token, 'date' => $today, 'checkInAt' => now_iso(), 'method' => (string)($p['method'] ?? 'qr'), 'byId' => $byId, 'device' => substr((string)($p['device'] ?? ''), 0, 64), 'status' => $punc['status'], 'lateMinutes' => $punc['lateMinutes'], 'createdAt' => now_iso()]);
        audit('summer.checkin', $byId, $s['studentId'], ['date' => $today, 'status' => $punc['status']], (string)($p['ip'] ?? ''));
        $days = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$s['studentId']])['c'] ?? 0);
        checkin_student_email($s, $days);
    }
    return ['ok' => true, 'already' => $already, 'student' => summer_student_public($s), 'status' => $punc['status'], 'lateMinutes' => $punc['lateMinutes']];
}

/** Stamp a departure time on today's attendance row (optional dwell tracking).
 *  Same auth model as check-in (gate token or 'summer' cap). */
function summer_checkout(array $p): array {
    if (!empty($p['gateAuthorized'])) {
        $byId = substr((string)($p['byId'] ?? 'kiosk'), 0, 64) ?: 'kiosk';
    } else {
        $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
        $byId = (string)$g['requester']['memberId'];
    }
    $token = trim((string)($p['token'] ?? ''));
    $qr = db_row('SELECT * FROM qr_codes WHERE token = ? LIMIT 1', [$token]);
    if (!$qr || empty($qr['studentId'])) return ['ok' => false, 'error' => 'qr_unassigned'];
    $today = gmdate('Y-m-d');
    $row = db_row('SELECT * FROM attendance WHERE studentId = ? AND date = ?', [(string)$qr['studentId'], $today]);
    if (!$row) return ['ok' => false, 'error' => 'not_checked_in'];
    if (!empty($row['checkOutAt'])) return ['ok' => true, 'already' => true, 'checkOutAt' => $row['checkOutAt']];
    db_update('attendance', ['checkOutAt' => now_iso()], ['id' => $row['id']]);
    audit('summer.checkout', $byId, (string)$qr['studentId'], ['date' => $today], (string)($p['ip'] ?? ''));
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [(string)$qr['studentId']]);
    return ['ok' => true, 'already' => false, 'checkOutAt' => now_iso(), 'student' => $s ? summer_student_public($s) : null];
}

/** Email guardians of students absent today (or one named student) a gentle
 *  "we missed them" nudge — the manual follow-up the at-risk list points to. */
function admin_summer_absence_alert(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $cid = trim((string)($p['cohortId'] ?? '')) ?: $c['cohortId'];
    $today = gmdate('Y-m-d');
    $one = trim((string)($p['studentId'] ?? ''));
    if ($one !== '') {
        $rows = db_all("SELECT * FROM summer_students WHERE studentId = ? LIMIT 1", [$one]);
    } else {
        // Active students in the cohort with no attendance row today.
        $rows = db_all("SELECT * FROM summer_students WHERE cohortId = ? AND status = 'active'
                        AND studentId NOT IN (SELECT studentId FROM attendance WHERE date = ?) ORDER BY fullName LIMIT 300", [$cid, $today]);
    }
    $sent = 0; $skipped = 0;
    foreach ($rows as $s) {
        $to = trim((string)($s['parentEmail'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) { $skipped++; continue; }
        $first = esc_html(explode(' ', trim((string)$s['fullName']))[0] ?: 'your child');
        $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/q/' . rawurlencode((string)$s['token']);
        $ok = @send_mail($to, "We missed {$first} today", email_template([
            'title' => 'We missed them today',
            'intro' => "{$first} wasn't checked in at NGG Summer School today.",
            'bodyHtml' => '<p style="margin:0 0 10px">If everything\'s okay, no need to reply — but consistent attendance is how the growth compounds, and we\'d love to see them next session.</p>',
            'ctaLabel' => "See {$first}'s attendance →", 'ctaUrl' => $url,
            'footNote' => "You are receiving this because you are {$first}'s guardian at Next Generation Genius.",
        ]));
        if ($ok) $sent++; else $skipped++;
    }
    audit('summer.absence.alert', $g['requester']['memberId'], $one ?: $cid, ['sent' => $sent, 'skipped' => $skipped], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent, 'skipped' => $skipped, 'absent' => count($rows)];
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
                // Volunteer tokens serve the volunteer's digital ID here. Resolve
                // any volunteer that isn't explicitly declined/removed (a bound
                // token means they were approved) so a non-'active' status value
                // doesn't wrongly 404 the ID link.
                $v = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND (status IS NULL OR status NOT IN ('declined','removed','deleted')) LIMIT 1", [$qr['studentId']]);
                if ($v) return ['ok' => true, 'profile' => volunteer_public($v, true)];
            }
        }
    } elseif ($handle !== '') {
        $s = db_row('SELECT * FROM summer_students WHERE handle = ? LIMIT 1', [$handle]);
    }
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'profile' => summer_student_public($s, true)];
}
