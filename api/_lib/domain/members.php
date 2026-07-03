<?php
declare(strict_types=1);

/** Members — dashboard, profile update, notifications. */

function member_dashboard(array $p): array {
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

    // Unread notifications (this member or broadcast).
    $notes = db_all("SELECT * FROM notifications WHERE (memberId = ? OR memberId = '*') AND (readAt = '' OR readAt IS NULL) ORDER BY createdAt DESC LIMIT 8", [$memberId]);
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

function member_notifications(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $rows = db_all("SELECT * FROM notifications WHERE memberId = ? OR memberId = '*' ORDER BY createdAt DESC LIMIT 50", [$memberId]);
    return ['ok' => true, 'notifications' => array_map('public_notification', $rows)];
}

function member_notification_read(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $notifId = (string)($p['notifId'] ?? '');
    $row = db_row("SELECT * FROM notifications WHERE notifId = ? AND (memberId = ? OR memberId = '*') LIMIT 1", [$notifId, $memberId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_update('notifications', ['readAt' => now_iso()], ['id' => $row['id']]);
    return ['ok' => true];
}
