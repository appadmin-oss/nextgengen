<?php
declare(strict_types=1);

/**
 * Volunteers — the approved roster behind the public /volunteer form.
 *
 * Lifecycle: registration lands in `applications` (kind='volunteer',
 * status 'new', admin notified by email + bus event) → admin reviews via
 * api/admin/volunteers.php → APPROVE mints the volunteer ID (VOL-YY-serial),
 * binds a check-in QR token (volunteers take attendance exactly like
 * students), creates the public profile behind /q/<token>, and delivers the
 * digital ID by email — plus SMS when the admin has it on
 * (volunteer_sms_notify setting; on by default once SMS creds exist).
 */

/** Race-safe VOL-YY-serial allocator (mirrors card_display_id). */
function volunteer_display_id(): string {
    $yy = gmdate('y');
    for ($i = 0; $i < 40; $i++) {
        $n = (int)(db_row('SELECT COUNT(*) c FROM volunteers WHERE volunteerId LIKE ?', ['VOL-' . $yy . '-%'])['c'] ?? 0) + 1 + $i;
        $id = sprintf('VOL-%s-%03d', $yy, $n);
        if (!db_row('SELECT id FROM volunteers WHERE volunteerId = ?', [$id])) return $id;
    }
    return 'VOL-' . $yy . '-' . strtolower(rand_hex(3));
}

function volunteer_public(array $v, bool $withAttendance = false): array {
    $out = [
        'kind' => 'volunteer',
        'volunteerId' => $v['volunteerId'],
        'studentId' => $v['volunteerId'],   // lets the scanner/profile UIs reuse one shape
        'fullName' => $v['fullName'],
        'role' => $v['role'],
        'courses' => json_decode((string)($v['courses'] ?? ''), true) ?: [],
        'photoUrl' => (string)($v['photoUrl'] ?? ''),
        'status' => $v['status'],
        'safeguardingCleared' => (string)($v['safeguarding'] ?? 'pending') === 'cleared',
    ];
    if ($withAttendance) {
        $rows = db_all('SELECT date, checkInAt, method FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 60', [$v['volunteerId']]);
        $out['attendance'] = $rows;
        $out['attendanceCount'] = count($rows);
        $out += volunteer_ledger((string)$v['volunteerId']);
    }
    return $out;
}

/* ── Service ledger: sessions → hours → milestone certificates ────────────── */

const VOL_MILESTONES = [5, 10, 25, 50];

function volunteer_session_hours(): int {
    $h = (int)(setting_raw('volunteer_session_hours') ?: 4);
    return max(1, min(12, $h));
}

function volunteer_ledger(string $volunteerId): array {
    $sessions = (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$volunteerId])['c'] ?? 0);
    $certs = db_all('SELECT certId, milestone, hours, issuedAt FROM volunteer_certs WHERE volunteerId = ? ORDER BY milestone', [$volunteerId]);
    return ['sessions' => $sessions, 'hours' => $sessions * volunteer_session_hours(), 'certificates' => $certs];
}

/** Crossing a milestone mints a verifiable certificate — once per milestone. */
function volunteer_maybe_issue_cert(array $v, int $sessions): ?array {
    if (!in_array($sessions, VOL_MILESTONES, true)) return null;
    if (db_row('SELECT id FROM volunteer_certs WHERE volunteerId = ? AND milestone = ?', [$v['volunteerId'], $sessions])) return null;
    $certId = 'NGGV-' . strtoupper(rand_hex(5));
    while (db_row('SELECT id FROM volunteer_certs WHERE certId = ?', [$certId])) $certId = 'NGGV-' . strtoupper(rand_hex(5));
    $hours = $sessions * volunteer_session_hours();
    db_insert('volunteer_certs', ['certId' => $certId, 'volunteerId' => (string)$v['volunteerId'], 'milestone' => $sessions, 'hours' => $hours, 'issuedAt' => now_iso()]);
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/cert/' . $certId;
    if (!empty($v['email'])) {
        @send_mail((string)$v['email'], "{$sessions} sessions of service — your certificate", email_template([
            'title' => 'Milestone unlocked',
            'intro' => 'Hello ' . esc_html((string)$v['fullName']) . " — you've now shown up for {$sessions} sessions (≈{$hours} hours of service).",
            'bodyHtml' => '<p style="margin:0 0 10px">Your certificate is live, verifiable, and yours to share — print it or link it anywhere.</p>',
            'ctaLabel' => 'Open my certificate →', 'ctaUrl' => $url,
        ]));
    }
    event_emit('volunteer.milestone', ['ref' => (string)$v['volunteerId'], 'name' => (string)$v['fullName'], 'sessions' => $sessions, 'hours' => $hours, 'cert' => $certId]);
    return ['certId' => $certId, 'milestone' => $sessions, 'hours' => $hours];
}

/** Public, verifiable certificate — anyone with the link can confirm it. */
function public_cert(array $p): array {
    $c = db_row('SELECT * FROM volunteer_certs WHERE certId = ? LIMIT 1', [strtoupper(trim((string)($p['id'] ?? '')))]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$c['volunteerId']]);
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'cert' => [
        'certId' => $c['certId'], 'milestone' => (int)$c['milestone'], 'hours' => (int)$c['hours'],
        'issuedAt' => $c['issuedAt'], 'fullName' => $v['fullName'], 'role' => $v['role'],
        'volunteerId' => $v['volunteerId'],
    ]];
}

/* ── Safeguarding: pending until screening clears — the scanner shows it ──── */

function admin_volunteer_safeguard(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['pending', 'cleared'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $volunteerId = (string)($p['volunteerId'] ?? '');
    $n = db_update('volunteers', ['safeguarding' => $status, 'updatedAt' => now_iso()], ['volunteerId' => $volunteerId]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('volunteer.safeguard', $g['requester']['memberId'], $volunteerId, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Upcoming sessions (capacity-aware) — offered at approval ─────────────── */

function volunteer_upcoming_sessions(int $limit = 3): array {
    $rows = db_all("SELECT eventId, title, startAt, centre, location, capacity FROM events WHERE status = 'published' AND startAt >= ? ORDER BY startAt LIMIT " . max(1, min(6, $limit)), [now_iso()]);
    foreach ($rows as &$e) {
        $taken = (int)(db_row('SELECT COUNT(*) c FROM event_rsvps WHERE eventId = ?', [$e['eventId']])['c'] ?? 0);
        $e['spotsLeft'] = (int)$e['capacity'] > 0 ? max(0, (int)$e['capacity'] - $taken) : null;
        unset($e['capacity']);
    }
    unset($e);
    return $rows;
}

/* ── Instructor view: course roster, gated by token + registered email ────── */

function public_instructor_roster(array $p): array {
    $token = trim((string)($p['token'] ?? ''));
    $email = strtolower(trim((string)($p['email'] ?? '')));
    $v = db_row("SELECT * FROM volunteers WHERE token = ? AND status = 'active' LIMIT 1", [$token]);
    if (!$v || $email === '' || strtolower((string)$v['email']) !== $email) return ['ok' => false, 'error' => 'not_authorised'];
    if ((string)$v['role'] !== 'instructor') return ['ok' => false, 'error' => 'not_instructor'];
    $courses = json_decode((string)($v['courses'] ?? ''), true) ?: [];
    if (!$courses) return ['ok' => true, 'courses' => [], 'students' => []];
    $ph = implode(',', array_fill(0, count($courses), '?'));
    $rows = db_all("SELECT studentId, fullName, track FROM summer_students WHERE status = 'active' AND regStatus = 'verified' AND track IN ($ph) ORDER BY fullName", $courses);
    $today = gmdate('Y-m-d');
    $students = [];
    foreach ($rows as $r) {
        // First names only — this view exists for the room, not for data export.
        $students[] = [
            'firstName' => explode(' ', trim((string)$r['fullName']))[0],
            'course' => $r['track'],
            'days' => (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$r['studentId']])['c'] ?? 0),
            'todayPresent' => (bool)db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$r['studentId'], $today]),
        ];
    }
    return ['ok' => true, 'courses' => $courses, 'students' => $students];
}

function admin_volunteers_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $pending = db_all("SELECT id, name, email, phone, role, courses, why, status, createdAt FROM applications WHERE kind = 'volunteer' AND status IN ('new', 'reviewing') ORDER BY id DESC LIMIT 200");
    foreach ($pending as &$a) $a['courses'] = json_decode((string)($a['courses'] ?? ''), true) ?: [];
    unset($a);
    $roster = db_all('SELECT volunteerId, fullName, email, phone, role, courses, token, status, safeguarding, createdAt FROM volunteers ORDER BY id DESC LIMIT 500');
    foreach ($roster as &$v) $v['courses'] = json_decode((string)($v['courses'] ?? ''), true) ?: [];
    unset($v);
    return ['ok' => true, 'pending' => $pending, 'volunteers' => $roster];
}

function admin_volunteer_approve(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row("SELECT * FROM applications WHERE id = ? AND kind = 'volunteer' LIMIT 1", [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];

    // Idempotent: approving twice (or a second application from the same
    // email) surfaces the existing record instead of minting a duplicate.
    $existing = db_row('SELECT * FROM volunteers WHERE applicationId = ? OR lower(email) = ? LIMIT 1', [$id, strtolower((string)$a['email'])]);
    if ($existing) {
        db_update('applications', ['status' => 'accepted'], ['id' => $id]);
        return ['ok' => true, 'already' => true, 'volunteer' => volunteer_public($existing) + ['token' => $existing['token']]];
    }
    // Instructors must be reachable by phone before an ID goes out.
    if ((string)$a['role'] === 'instructor' && trim((string)($a['phone'] ?? '')) === '') {
        return ['ok' => false, 'error' => 'phone_required'];
    }

    $volunteerId = volunteer_display_id();
    // Bind a check-in token — same pool the gate scanner reads.
    $token = 'VOLQR-' . strtoupper(rand_hex(4));
    while (db_row('SELECT id FROM qr_codes WHERE token = ?', [$token])) $token = 'VOLQR-' . strtoupper(rand_hex(4));
    $c = summer_ensure_cohort();
    db_insert('qr_codes', ['token' => $token, 'batch' => 'VOL', 'cohortId' => $c['cohortId'], 'status' => 'assigned', 'studentId' => $volunteerId, 'assignedName' => (string)$a['name'], 'createdAt' => now_iso(), 'assignedAt' => now_iso()]);
    db_insert('volunteers', [
        'volunteerId' => $volunteerId, 'applicationId' => $id,
        'fullName' => (string)$a['name'], 'email' => (string)$a['email'], 'phone' => (string)($a['phone'] ?? ''),
        'role' => (string)$a['role'], 'courses' => (string)($a['courses'] ?? ''),
        'token' => $token, 'photoUrl' => (string)($a['photoUrl'] ?? ''),
        'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);

    $sent = volunteer_send_id($volunteerId);
    audit('volunteer.approve', $g['requester']['memberId'], $volunteerId, ['applicationId' => $id, 'channels' => $sent], (string)($p['ip'] ?? ''));
    event_emit('volunteer.approved', ['ref' => $volunteerId, 'name' => (string)$a['name'], 'role' => (string)$a['role'], 'status' => 'active']);
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ?', [$volunteerId]);
    return ['ok' => true, 'volunteer' => volunteer_public($v) + ['token' => $token], 'idSent' => $sent];
}

/** Deliver the digital ID — email always; SMS when the admin has it on. */
function volunteer_send_id(string $volunteerId): array {
    $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v) return [];
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/q/' . $v['token'];
    $roleLabel = ucfirst((string)$v['role']);
    $channels = [];
    $sessionsHtml = (function () {
        $out = '';
        foreach (volunteer_upcoming_sessions() as $e) {
            $when = date('D j M · H:i', strtotime((string)$e['startAt']));
            $where = trim(((string)($e['centre'] ?? '')) . ' ' . ((string)($e['location'] ?? '')));
            $spots = $e['spotsLeft'] === null ? '' : ' · ' . (int)$e['spotsLeft'] . ' spots left';
            $out .= '<li style="margin:0 0 6px">' . esc_html((string)$e['title']) . ' — ' . esc_html($when) . ($where !== '' ? ' · ' . esc_html($where) : '') . esc_html($spots) . '</li>';
        }
        return $out === '' ? '' : '<p style="margin:14px 0 6px"><b>Come shadow a session:</b></p><ul style="margin:0;padding-left:18px">' . $out . '</ul>';
    })();
    $html = email_template([
        'title' => "You're in — welcome to the team",
        'intro' => 'Hello ' . esc_html((string)$v['fullName']) . ' — your volunteer registration was approved.',
        'bodyHtml' => '<p style="margin:0 0 10px"><b>Volunteer ID:</b> ' . esc_html($volunteerId) . '<br><b>Role:</b> ' . esc_html($roleLabel) . '</p>'
            . '<p style="margin:0 0 10px">The link below is your digital ID and attendance profile — the QR on your printed card opens the same page. Show either at any centre to check in.</p>'
            . $sessionsHtml,
        'ctaLabel' => 'Open my volunteer ID →', 'ctaUrl' => $url,
        'footNote' => 'Printed IDs are issued at your first session. Roles working directly with teenagers complete safeguarding screening first.',
    ]);
    if (!empty($v['email']) && send_mail((string)$v['email'], "Your NGG volunteer ID — {$volunteerId}", $html)) $channels[] = 'email';
    if (!empty($v['phone']) && sms_enabled() && setting_raw('volunteer_sms_notify') !== '0') {
        $r = sms_send((string)$v['phone'], "NGG: you're approved as a {$roleLabel} volunteer. ID {$volunteerId}. Your digital ID: {$url}");
        if (!empty($r['ok'])) $channels[] = 'sms';
    }
    return $channels;
}

function admin_volunteer_decline(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row("SELECT * FROM applications WHERE id = ? AND kind = 'volunteer' LIMIT 1", [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    db_update('applications', ['status' => 'rejected'], ['id' => $id]);
    $reason = substr(trim((string)($p['reason'] ?? '')), 0, 500);
    if (!empty($a['email'])) {
        @send_mail((string)$a['email'], 'About your NGG volunteer registration', email_template([
            'title' => 'Thank you for offering your time',
            'intro' => 'Hello ' . esc_html((string)$a['name']) . ' — we reviewed your volunteer registration.',
            'bodyHtml' => '<p style="margin:0 0 10px">We can&rsquo;t take you on this intake' . ($reason !== '' ? ': ' . esc_html($reason) : '.') . '</p><p style="margin:0">Registrations reopen every season — we&rsquo;d genuinely love to see you again.</p>',
        ]));
    }
    audit('volunteer.decline', $g['requester']['memberId'], (string)$id, ['reason' => $reason !== ''], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
