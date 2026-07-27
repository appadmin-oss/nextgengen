<?php
declare(strict_types=1);

/** Members — dashboard, profile update, notifications. */

function member_dashboard(array $p): array {
    if (function_exists('anchor_ensure_seed')) anchor_ensure_seed();
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    $stats = db_row('SELECT * FROM member_stats WHERE memberId = ? LIMIT 1', [$memberId]) ?: [];
    $sc = session_current();
    $session = $sc['current'] ?: $sc['next'];
    $sessionId = $session['sessionId'] ?? '';
    $week = $session ? week_of_session_from_public($session) : 1;

    // This week's missions + this member's progress on them.
    $missions = db_all('SELECT * FROM anchor_missions WHERE week = ? AND isActive = 1 ORDER BY orderIndex', [min(12, $week)]);
    $progRows = db_all('SELECT * FROM member_progress WHERE memberId = ? AND sessionId = ?', [$memberId, $sessionId]);
    $progByMission = [];
    foreach ($progRows as $r) $progByMission[$r['missionId']] = $r;

    $today = array_map(function ($m) use ($progByMission) {
        return [
            'missionId' => $m['missionId'], 'title' => $m['title'], 'prompt' => $m['prompt'],
            'xp' => (int)$m['xp'], 'type' => $m['type'], 'proof' => $m['proof'],
            'bookPage' => (int)$m['bookPage'], 'estimatedMin' => (int)$m['estimatedMin'],
            'status' => $progByMission[$m['missionId']]['status'] ?? 'todo',
        ];
    }, $missions);

    // Upcoming events (next 30d, member's centre or Both/Online).
    $now = now_iso();
    $horizon = gmdate('Y-m-d\TH:i:s\Z', time() + 30 * 86400);
    $events = db_all(
        "SELECT * FROM events WHERE status='published' AND (centre IN ('Both','Online') OR centre = ?) AND startAt >= ? AND startAt <= ? ORDER BY startAt LIMIT 5",
        [$member['centre'], $now, $horizon]
    );
    $events = array_map('public_event', $events);

    // Unread notifications (this member, or a broadcast whose audience matches).
    [$bc, $bcp] = notif_broadcast_clause($member);
    $notes = db_all("SELECT * FROM notifications WHERE (memberId = ? OR $bc) AND (readAt = '' OR readAt IS NULL) ORDER BY createdAt DESC LIMIT 8", array_merge([$memberId], $bcp));
    $notes = array_map('public_notification', $notes);

    // Assigned mentor for the current session.
    $mentor = null;
    if ($session) {
        $link = db_row("SELECT * FROM mentor_assignments WHERE memberId = ? AND sessionId = ? AND status='active' LIMIT 1", [$memberId, $sessionId]);
        if ($link) {
            $m = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$link['mentorId']]);
            if ($m) $mentor = public_mentor($m);
        }
    }

    return [
        'ok' => true,
        'member' => public_member($member),
        'stats' => [
            'xp' => (int)($stats['xpTotal'] ?? 0),
            'level' => (int)($stats['level'] ?? 1),
            'streak' => (int)($stats['streak'] ?? 0),
            'badges' => safe_json($stats['badges'] ?? null) ?: [],
            'badgeCount' => (int)($stats['badgeCount'] ?? 0),
            'currentWeek' => $week,
            'completedThisSession' => (int)($stats['completedThisSession'] ?? 0),
            'lastActiveAt' => $stats['lastActiveAt'] ?? '',
        ],
        'session' => $session,
        'today' => $today,
        'events' => $events,
        'notifications' => $notes,
        'mentor' => $mentor,
        // Assignments surfaced inline so the dashboard card renders without a
        // second round-trip.
        'assignments' => assignment_list_for_member(['memberId' => $memberId])['assignments'] ?? [],
    ];
}

/** week_of_session works on a raw row; the dashboard has a public_session shape. */
function week_of_session_from_public(array $s): int {
    $start = strtotime((string)$s['startDate']);
    if ($start === false || time() < $start) return $s['weekOf'] ?? 1;
    return max(1, (int)($s['weekOf'] ?? 1));
}

function member_update(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$member) return ['ok' => false, 'error' => 'not_found'];

    $allowed = ['bio', 'photoUrl', 'socials', 'phone', 'parentEmail', 'parentPhone', 'school', 'fullName'];
    $patch = ['updatedAt' => now_iso()];
    foreach ($allowed as $k) {
        if (array_key_exists($k, $p)) {
            $patch[$k] = ($k === 'socials' && is_array($p[$k])) ? json_encode($p[$k], JSON_UNESCAPED_SLASHES) : $p[$k];
        }
    }
    db_update('members', $patch, ['id' => $member['id']]);
    audit('member.update', $memberId, $memberId, ['keys' => array_keys($patch)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Public, privacy-safe cohort leaderboard: top active NGG members by XP,
 *  first name + last initial only (they're minors). Powers the Club page. */
function public_leaderboard(array $p): array {
    $limit = max(3, min(50, (int)($p['limit'] ?? 12)));
    $rows = db_all("SELECT m.memberId, m.fullName, m.centre, COALESCE(s.xpTotal,0) xp, COALESCE(s.level,1) level, COALESCE(s.streak,0) streak, COALESCE(s.currentWeek,1) week
                    FROM members m LEFT JOIN member_stats s ON s.memberId = m.memberId
                    WHERE m.status = 'active' AND m.type = 'NGG'
                    ORDER BY xp DESC, m.fullName ASC LIMIT " . $limit);
    /* Behaviour stars, batched.
     *
     * Stars are the thing mentors actually record every session, and they were
     * nowhere on the board a cohort watches — so the one signal a child can
     * move by turning up and behaving well was invisible, while XP (which
     * accrues from journal activity) was the whole ranking. Shown alongside
     * XP rather than folded into it: they measure different things, and a
     * single blended number would hide which one a child is moving. */
    $starOf = [];
    if ($rows) {
        $ids = array_column($rows, 'memberId');
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $weekAgo = gmdate('Y-m-d', time() - 6 * 86400);
        foreach (db_all("SELECT subjectId, SUM(stars) total, SUM(CASE WHEN date >= ? THEN stars ELSE 0 END) wk
                         FROM member_stars WHERE subjectId IN $in GROUP BY subjectId",
                        array_merge([$weekAgo], $ids)) as $r2) {
            $starOf[(string)$r2['subjectId']] = ['total' => (int)$r2['total'], 'week' => (int)$r2['wk']];
        }
    }

    $out = []; $rank = 0;
    foreach ($rows as $r) {
        $rank++;
        $parts = preg_split('/\s+/', trim((string)$r['fullName'])) ?: [];
        $first = $parts[0] ?? 'Member';
        $initial = count($parts) > 1 ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
        $st = $starOf[(string)$r['memberId']] ?? ['total' => 0, 'week' => 0];
        $out[] = [
            'rank' => $rank, 'memberId' => (string)$r['memberId'], 'first' => $first, 'initial' => $initial,
            'centre' => (string)($r['centre'] ?? ''), 'xp' => (int)$r['xp'], 'level' => (int)$r['level'],
            'streak' => (int)$r['streak'], 'week' => (int)$r['week'],
            'stars' => $st['total'], 'starsThisWeek' => $st['week'],
        ];
    }
    return ['ok' => true, 'leaderboard' => $out, 'total' => count($out)];
}

/** SQL clause (+params) matching broadcast rows targeted to THIS member. A
 *  broadcast with no/`all` audience reaches everyone; a centre/type audience
 *  reaches only matching members — mirroring the emailed audience. */
function notif_broadcast_clause(?array $member): array {
    $centre = (string)($member['centre'] ?? '');
    $type = (string)($member['type'] ?? '');
    return ["(memberId = '*' AND (audience IS NULL OR audience = '' OR audience = 'all' OR audience = ? OR audience = ?))", [$centre, $type]];
}

function member_notifications(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = db_row('SELECT centre, type FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    [$bc, $bcp] = notif_broadcast_clause($member);
    $rows = db_all("SELECT * FROM notifications WHERE memberId = ? OR $bc ORDER BY createdAt DESC LIMIT 50", array_merge([$memberId], $bcp));
    return ['ok' => true, 'notifications' => array_map('public_notification', $rows)];
}

/**
 * Per-member key→JSON state store. Backs the Anchor Journal's daily systems,
 * weekly self-score and peer-modeling data with real cross-device persistence.
 * Keys are namespaced by the client, e.g. "systems:2026-07-04", "peers",
 * "selfscore:2026-W27", "prefs". Values are arbitrary JSON (size-bounded).
 */
function member_state_get(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $keys = $p['keys'] ?? [];
    if (is_string($keys)) $keys = array_filter(array_map('trim', explode(',', $keys)));
    $out = [];
    if (!empty($keys)) {
        $place = implode(',', array_fill(0, count($keys), '?'));
        $rows = db_all("SELECT stateKey, stateValue FROM member_state WHERE memberId = ? AND stateKey IN ($place)", array_merge([$memberId], array_values($keys)));
    } else {
        $rows = db_all('SELECT stateKey, stateValue FROM member_state WHERE memberId = ?', [$memberId]);
    }
    foreach ($rows as $r) $out[$r['stateKey']] = safe_json($r['stateValue']);
    return ['ok' => true, 'state' => $out];
}

function member_state_set(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $key = trim((string)($p['key'] ?? ''));
    if ($key === '' || strlen($key) > 80) return ['ok' => false, 'error' => 'bad_key'];
    $value = $p['value'] ?? null;
    $json = is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_SLASHES);
    if (strlen((string)$json) > 20000) return ['ok' => false, 'error' => 'too_large'];
    db_upsert('member_state',
        ['memberId' => $memberId, 'stateKey' => $key, 'stateValue' => $json, 'updatedAt' => now_iso()],
        ['memberId', 'stateKey'],
        ['stateValue' => $json, 'updatedAt' => now_iso()]
    );
    return ['ok' => true];
}

/** Member requests an email change → verification link to the NEW address. */
function member_request_email_change(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $new = strtolower(trim((string)($p['email'] ?? '')));
    if (!filter_var($new, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    if ($new === strtolower((string)$m['email'])) return ['ok' => false, 'error' => 'same_email'];
    if (db_row('SELECT id FROM members WHERE lower(email) = ? AND memberId != ? LIMIT 1', [$new, $mid])) return ['ok' => false, 'error' => 'email_taken'];
    $token = rand_hex(20);
    db_update('members', ['pendingEmail' => $new, 'emailChangeToken' => $token, 'emailChangeExpiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + 86400), 'updatedAt' => now_iso()], ['id' => $m['id']]);
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/api/member/confirm-email.php?m=' . rawurlencode($mid) . '&t=' . $token;
    @send_mail($new, 'Confirm your new NGG email', email_template([
        'title' => 'Confirm your new email',
        'intro' => 'Hi ' . esc_html(explode(' ', (string)$m['fullName'])[0] ?: 'there') . ', confirm this address to make it your NGG sign-in email.',
        'bodyHtml' => '<p style="margin:0 0 10px">If you didn\'t request this, ignore this email — nothing changes until you confirm. The link expires in 24 hours.</p>',
        'ctaLabel' => 'Confirm this email →', 'ctaUrl' => $url,
    ]));
    audit('member.email.change_request', $mid, $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'pending' => mask_email($new)];
}

/** Confirm an email change via the signed token (from the new address). */
function member_confirm_email_change(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $token = (string)($p['token'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m || empty($m['emailChangeToken']) || $token === '') return ['ok' => false, 'error' => 'invalid'];
    if (!hash_equals((string)$m['emailChangeToken'], $token)) return ['ok' => false, 'error' => 'invalid'];
    if (strtotime((string)$m['emailChangeExpiresAt']) < time()) return ['ok' => false, 'error' => 'expired'];
    $new = strtolower(trim((string)$m['pendingEmail']));
    if (!filter_var($new, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'invalid'];
    if (db_row('SELECT id FROM members WHERE lower(email) = ? AND memberId != ? LIMIT 1', [$new, $mid])) return ['ok' => false, 'error' => 'email_taken'];
    db_update('members', ['email' => $new, 'pendingEmail' => '', 'emailChangeToken' => '', 'emailChangeExpiresAt' => '', 'updatedAt' => now_iso()], ['id' => $m['id']]);
    audit('member.email.changed', $mid, $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'email' => $new];
}

/** GDPR self-service export: everything we hold about this member, as JSON. */
function member_export(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT memberId, fullName, email, phone, type, status, role, centre, track, cohort, school, bio, socials, parentName, parentEmail, parentPhone, joinDate, createdAt FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'export' => [
        'profile' => $m,
        'stats' => db_row('SELECT * FROM member_stats WHERE memberId = ?', [$mid]) ?: null,
        'progress' => db_all('SELECT missionId, sessionId, status, submittedAt, verifiedAt FROM member_progress WHERE memberId = ?', [$mid]),
        'journal' => db_all('SELECT mood, body, isPrivate, createdAt FROM journal WHERE memberId = ?', [$mid]),
        'assignments' => db_all('SELECT assignmentId, answerText, status, grade, feedback, submittedAt FROM assignment_submissions WHERE memberId = ?', [$mid]),
        'notifications' => db_all('SELECT title, body, kind, createdAt FROM notifications WHERE memberId = ?', [$mid]),
        'devices' => db_all("SELECT ip, userAgent, createdAt, lastSeenAt FROM device_sessions WHERE memberId = ?", [$mid]),
        'exportedAt' => now_iso(),
    ]];
}

/** Erase a member: scrub PII, anonymise the row, revoke sessions. Kept (not
 *  hard-deleted) for referential integrity of aggregate records. */
function member_erase(string $mid, string $by, string $ip = ''): array {
    $m = db_row('SELECT id, role FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (strtolower((string)$m['role']) === 'super_admin') return ['ok' => false, 'error' => 'cannot_delete_super_admin'];
    db_update('members', [
        'fullName' => 'Deleted member', 'email' => '', 'phone' => '', 'photoUrl' => '', 'bio' => '',
        'socials' => '', 'parentName' => '', 'parentEmail' => '', 'parentPhone' => '', 'school' => '',
        'notes' => '', 'passwordHash' => '', 'totpSecret' => '', 'totpBackup' => '',
        'pendingEmail' => '', 'emailChangeToken' => '', 'status' => 'deleted', 'updatedAt' => now_iso(),
    ], ['id' => $m['id']]);
    db_update('device_sessions', ['revokedAt' => now_iso()], ['memberId' => $mid]);
    db_exec('DELETE FROM journal WHERE memberId = ?', [$mid]);
    audit('member.erase', $by ?: null, $mid, [], $ip);
    return ['ok' => true];
}

function member_delete_account(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    return member_erase($mid, $mid, (string)($p['ip'] ?? ''));
}

function admin_member_delete(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    return member_erase((string)($p['memberId'] ?? ''), (string)($p['requesterId'] ?? ''), (string)($p['ip'] ?? ''));
}

function member_notification_read(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $notifId = (string)($p['notifId'] ?? '');
    $row = db_row("SELECT * FROM notifications WHERE notifId = ? AND (memberId = ? OR memberId = '*') LIMIT 1", [$notifId, $memberId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_update('notifications', ['readAt' => now_iso()], ['id' => $row['id']]);
    return ['ok' => true];
}
