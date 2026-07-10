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
    ];
    if ($withAttendance) {
        $rows = db_all('SELECT date, checkInAt, method FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 60', [$v['volunteerId']]);
        $out['attendance'] = $rows;
        $out['attendanceCount'] = count($rows);
    }
    return $out;
}

function admin_volunteers_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $pending = db_all("SELECT id, name, email, phone, role, courses, why, status, createdAt FROM applications WHERE kind = 'volunteer' AND status IN ('new', 'reviewing') ORDER BY id DESC LIMIT 200");
    foreach ($pending as &$a) $a['courses'] = json_decode((string)($a['courses'] ?? ''), true) ?: [];
    unset($a);
    $roster = db_all('SELECT volunteerId, fullName, email, phone, role, courses, token, status, createdAt FROM volunteers ORDER BY id DESC LIMIT 500');
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
    $html = email_template([
        'title' => "You're in — welcome to the team",
        'intro' => 'Hello ' . esc_html((string)$v['fullName']) . ' — your volunteer registration was approved.',
        'bodyHtml' => '<p style="margin:0 0 10px"><b>Volunteer ID:</b> ' . esc_html($volunteerId) . '<br><b>Role:</b> ' . esc_html($roleLabel) . '</p>'
            . '<p style="margin:0 0 10px">The link below is your digital ID and attendance profile — the QR on your printed card opens the same page. Show either at any centre to check in.</p>',
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
