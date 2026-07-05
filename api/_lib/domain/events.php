<?php
declare(strict_types=1);

/** Events, posts, sessions, and public reads. */

function event_list(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $member = $memberId ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]) : null;

    if ($member) {
        $rows = db_all("SELECT * FROM events WHERE status='published' AND (centre IN ('Both','Online') OR centre = ?) ORDER BY startAt", [$member['centre']]);
    } else {
        $rows = db_all("SELECT * FROM events WHERE status='published' AND isPublic = 1 ORDER BY startAt");
    }

    $rsvpBy = [];
    if ($memberId) {
        foreach (db_all('SELECT eventId, status FROM event_rsvps WHERE memberId = ?', [$memberId]) as $r) {
            $rsvpBy[$r['eventId']] = $r['status'];
        }
    }
    $now = now_iso();
    $events = array_map(function ($e) use ($rsvpBy, $now) {
        $out = public_event($e);
        $out['myRsvp'] = $rsvpBy[$e['eventId']] ?? null;
        $out['isPast'] = ((string)($e['endAt'] ?: $e['startAt']) < $now);
        return $out;
    }, $rows);
    return ['ok' => true, 'events' => $events];
}

function event_rsvp(array $p): array {
    $memberId = (string)($p['memberId'] ?? '');
    $eventId = (string)($p['eventId'] ?? '');
    $status = (string)($p['status'] ?? 'going');
    if (!in_array($status, ['going', 'maybe', 'cancelled'], true)) return ['ok' => false, 'error' => 'bad_status'];

    $evt = db_row('SELECT * FROM events WHERE eventId = ? LIMIT 1', [$eventId]);
    if (!$evt) return ['ok' => false, 'error' => 'event_not_found'];

    $existing = db_row('SELECT * FROM event_rsvps WHERE eventId = ? AND memberId = ? LIMIT 1', [$eventId, $memberId]);
    if ($existing) {
        db_update('event_rsvps', ['status' => $status, 'rsvpAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('event_rsvps', ['eventId' => $eventId, 'memberId' => $memberId, 'status' => $status, 'rsvpAt' => now_iso(), 'attendedAt' => '']);
    }
    push_notification($memberId, ['kind' => 'event', 'title' => 'RSVP: ' . $evt['title'], 'body' => $status === 'going' ? "You're going. See you there." : 'RSVP updated.', 'linkPage' => 'events']);
    audit('event.rsvp', $memberId, $eventId, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $status];
}

function public_events(array $p): array {
    $rows = db_all("SELECT * FROM events WHERE status='published' AND isPublic = 1 AND (endAt >= ? OR (endAt = '' AND startAt >= ?)) ORDER BY startAt LIMIT 20", [now_iso(), now_iso()]);
    return ['ok' => true, 'events' => array_map('public_event', $rows)];
}

function post_list(array $p): array {
    flip_scheduled_posts();
    $kind = (string)($p['kind'] ?? '');
    $tag = strtolower((string)($p['tag'] ?? ''));
    $rows = db_all("SELECT * FROM posts WHERE status='published' ORDER BY COALESCE(NULLIF(publishAt,''), createdAt) DESC");
    $out = [];
    foreach ($rows as $r) {
        if ($kind !== '' && $r['kind'] !== $kind) continue;
        if ($tag !== '' && strpos(strtolower((string)$r['tags']), $tag) === false) continue;
        $out[] = public_post($r);
    }
    return ['ok' => true, 'posts' => $out];
}

function post_get(array $p): array {
    flip_scheduled_posts();
    $slug = (string)($p['slug'] ?? '');
    $row = db_row("SELECT * FROM posts WHERE slug = ? AND status='published' LIMIT 1", [$slug]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'post' => public_post($row, true)];
}

function public_posts(array $p): array { return post_list($p); }

function op_session_current(array $p): array {
    $sc = session_current();
    return ['ok' => true, 'current' => $sc['current'], 'next' => $sc['next'], 'all' => $sc['all']];
}

function session_list(array $p): array {
    $year = (int)($p['year'] ?? gmdate('Y'));
    ensure_year($year);
    $rows = db_all('SELECT * FROM sessions WHERE year = ? ORDER BY startDate', [$year]);
    return ['ok' => true, 'sessions' => array_map('public_session', $rows)];
}

function session_ensure_year(array $p): array {
    $created = ensure_year((int)($p['year'] ?? gmdate('Y')));
    return ['ok' => true, 'created' => $created];
}

function op_public_session(array $p): array {
    $sc = session_current();
    return ['ok' => true, 'current' => $sc['current'], 'next' => $sc['next']];
}

function public_anchor_content(array $p): array {
    return ['ok' => true, 'content' => anchor_content()];
}

function public_stats(array $p): array {
    $active = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status='active'")['c'] ?? 0);
    $summer = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status='active' AND type='Summer'")['c'] ?? 0);
    $ngg = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status='active' AND type='NGG'")['c'] ?? 0);
    $graduates = (int)(db_row("SELECT COUNT(*) c FROM members WHERE status IN ('graduated-ngg','graduated-vanguard')")['c'] ?? 0);
    $mentors = (int)(db_row("SELECT COUNT(*) c FROM mentors WHERE status='active'")['c'] ?? 0);
    $verified = (int)(db_row("SELECT COUNT(*) c FROM member_progress WHERE status='verified'")['c'] ?? 0);
    $submitted = (int)(db_row("SELECT COUNT(*) c FROM member_progress WHERE status IN ('submitted','verified','rejected')")['c'] ?? 0);
    $centres = (int)(db_row("SELECT COUNT(DISTINCT centre) c FROM members WHERE status='active' AND centre != '' AND centre IS NOT NULL")['c'] ?? 0);

    return ['ok' => true, 'stats' => [
        'activeMembers' => $active, 'summer' => $summer, 'ngg' => $ngg, 'graduates' => $graduates,
        'mentors' => $mentors, 'missionsVerified' => $verified, 'missionsSubmitted' => $submitted,
        'completionRate' => $submitted > 0 ? (int)round($verified / $submitted * 100) : 0,
        'centres' => $centres,
    ]];
}

function public_newsletter(array $p): array {
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($email) > 200) return ['ok' => false, 'error' => 'email_too_long'];

    $existing = db_row('SELECT * FROM newsletter WHERE lower(email) = ? LIMIT 1', [$email]);
    if ($existing) {
        db_update('newsletter', ['status' => 'subscribed', 'updatedAt' => now_iso()], ['id' => $existing['id']]);
    } else {
        db_insert('newsletter', ['email' => $email, 'source' => (string)($p['source'] ?? 'site'), 'status' => 'subscribed', 'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'ip' => (string)($p['ip'] ?? '')]);
    }
    audit('newsletter.subscribe', null, $email, ['source' => $p['source'] ?? 'site'], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function public_apply(array $p): array {
    $kind = (string)($p['kind'] ?? 'teen');
    if ($kind !== 'teen' && $kind !== 'mentor') return ['ok' => false, 'error' => 'bad_kind'];
    // Respect the admin toggles (default open).
    $openKey = $kind === 'mentor' ? 'mentor_applications_open' : 'applications_open';
    if (setting_raw($openKey) === '0') return ['ok' => false, 'error' => 'applications_closed'];
    $name = trim((string)($p['name'] ?? ''));
    if (strlen($name) < 2 || strlen($name) > 120) return ['ok' => false, 'error' => 'bad_name'];
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email)) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($email) > 200) return ['ok' => false, 'error' => 'email_too_long'];
    $why = trim((string)($p['why'] ?? ''));
    if (strlen($why) > 2000) return ['ok' => false, 'error' => 'why_too_long'];

    $age = 0; $track = ''; $centre = ''; $role = '';
    if ($kind === 'teen') {
        $age = (int)($p['age'] ?? 0);
        if ($age < 10 || $age > 17) return ['ok' => false, 'error' => 'bad_age'];
        $track = substr(trim((string)($p['track'] ?? '')), 0, 60);
        $centre = substr(trim((string)($p['centre'] ?? '')), 0, 60);
    } else {
        $role = substr(trim((string)($p['role'] ?? '')), 0, 60);
    }

    $cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - 24 * 3600);
    $dupe = db_row('SELECT id FROM applications WHERE lower(email) = ? AND kind = ? AND createdAt > ? LIMIT 1', [$email, $kind, $cutoff]);
    if (!$dupe) {
        db_insert('applications', [
            'kind' => $kind, 'name' => $name, 'age' => $age ?: null, 'centre' => $centre, 'track' => $track,
            'role' => $role, 'why' => $why, 'email' => $email, 'status' => 'new', 'createdAt' => now_iso(), 'ip' => (string)($p['ip'] ?? ''),
        ]);
    }
    audit('apply.' . $kind, null, $email, ['name' => $name, 'track' => $track ?: $role], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'duplicate' => (bool)$dupe];
}
