<?php
declare(strict_types=1);

/**
 * Admin domain, part 2 — the "complete management" surface:
 * analytics overview, 360° member detail, mentor assignment, applications
 * review + convert, newsletter, and site settings. Every handler re-checks
 * admin role via admin_gate() (defined in admin.php).
 */

// ── Analytics overview ──────────────────────────────────────────────────────
function admin_overview(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $since30 = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);

    $byCentre = db_all("SELECT centre, COUNT(*) c FROM members WHERE status='active' AND centre != '' GROUP BY centre");
    $byTrack  = db_all("SELECT track, COUNT(*) c FROM members WHERE status='active' AND track != '' AND track IS NOT NULL GROUP BY track ORDER BY c DESC");

    return ['ok' => true, 'overview' => [
        'members' => [
            'active'   => $one("SELECT COUNT(*) c FROM members WHERE status='active'"),
            'ngg'      => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='NGG'"),
            'summer'   => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='Summer'"),
            'graduates'=> $one("SELECT COUNT(*) c FROM members WHERE status IN ('graduated-ngg','graduated-vanguard')"),
            'suspended'=> $one("SELECT COUNT(*) c FROM members WHERE status='suspended'"),
            'new30'    => $one("SELECT COUNT(*) c FROM members WHERE createdAt >= ?", [$since30]),
        ],
        'mentors' => ['active' => $one("SELECT COUNT(*) c FROM mentors WHERE status='active'"), 'total' => $one("SELECT COUNT(*) c FROM mentors")],
        'applications' => [
            'new'     => $one("SELECT COUNT(*) c FROM applications WHERE status='new'"),
            'total'   => $one("SELECT COUNT(*) c FROM applications"),
        ],
        'anchor' => [
            'journals'  => $one("SELECT COUNT(*) c FROM journal"),
            'verified'  => $one("SELECT COUNT(*) c FROM member_progress WHERE status='verified'"),
            'submitted' => $one("SELECT COUNT(*) c FROM member_progress WHERE status='submitted'"),
        ],
        'assignments' => [
            'published' => $one("SELECT COUNT(*) c FROM assignments WHERE status='published'"),
            'submitted' => $one("SELECT COUNT(*) c FROM assignment_submissions"),
            'toGrade'   => $one("SELECT COUNT(*) c FROM assignment_submissions WHERE status='submitted'"),
        ],
        'events'     => ['upcoming' => $one("SELECT COUNT(*) c FROM events WHERE status='published' AND startAt >= ?", [gmdate('Y-m-d\TH:i:s\Z')])],
        'newsletter' => ['subscribers' => $one("SELECT COUNT(*) c FROM newsletter WHERE status='subscribed'")],
        'byCentre'   => $byCentre,
        'byTrack'    => $byTrack,
        'recent'     => db_all("SELECT at, actorId, event, subject FROM audit_log ORDER BY id DESC LIMIT 12"),
    ]];
}

// ── 360° member detail ──────────────────────────────────────────────────────
function admin_member_detail(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    unset($m['totpSecret']);
    $m['socials'] = safe_json($m['socials'] ?? null);

    $stats = db_row('SELECT * FROM member_stats WHERE memberId = ? LIMIT 1', [$id]) ?: [];
    $journal = array_map(fn($r) => ['week' => (int)$r['week'], 'mood' => $r['mood'], 'body' => $r['body'], 'createdAt' => $r['createdAt']],
        db_all('SELECT week, mood, body, createdAt FROM journal WHERE memberId = ? ORDER BY createdAt DESC LIMIT 20', [$id]));

    $prog = db_row("SELECT COUNT(*) total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) submitted FROM member_progress WHERE memberId = ?", [$id]) ?: [];

    $subs = db_all("SELECT s.assignmentId, s.status, s.grade, s.submittedAt, a.title, a.points FROM assignment_submissions s LEFT JOIN assignments a ON a.assignmentId = s.assignmentId WHERE s.memberId = ? ORDER BY s.submittedAt DESC LIMIT 25", [$id]);

    $mentorLink = db_row("SELECT ma.mentorId, ma.sessionId, m.fullName FROM mentor_assignments ma LEFT JOIN mentors m ON m.mentorId = ma.mentorId WHERE ma.memberId = ? AND ma.status='active' ORDER BY ma.startedAt DESC LIMIT 1", [$id]);

    $state = [];
    foreach (db_all('SELECT stateKey, stateValue FROM member_state WHERE memberId = ?', [$id]) as $r) $state[$r['stateKey']] = safe_json($r['stateValue']);

    return ['ok' => true, 'detail' => [
        'member' => $m,
        'stats' => ['xp' => (int)($stats['xpTotal'] ?? 0), 'level' => (int)($stats['level'] ?? 1), 'streak' => (int)($stats['streak'] ?? 0), 'badges' => safe_json($stats['badges'] ?? null) ?: []],
        'journal' => $journal,
        'progress' => ['total' => (int)($prog['total'] ?? 0), 'verified' => (int)($prog['verified'] ?? 0), 'submitted' => (int)($prog['submitted'] ?? 0)],
        'submissions' => array_map(fn($s) => ['assignmentId' => $s['assignmentId'], 'title' => $s['title'] ?: $s['assignmentId'], 'points' => (int)($s['points'] ?? 0), 'status' => $s['status'], 'grade' => $s['grade'] === null ? null : (int)$s['grade'], 'submittedAt' => $s['submittedAt']], $subs),
        'mentor' => $mentorLink ? ['mentorId' => $mentorLink['mentorId'], 'fullName' => $mentorLink['fullName'], 'sessionId' => $mentorLink['sessionId']] : null,
        'state' => $state,
    ]];
}

// ── Mentor assignment ───────────────────────────────────────────────────────
function admin_assign_mentor(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $memberId = (string)($p['memberId'] ?? '');
    $mentorId = (string)($p['mentorId'] ?? '');
    $sc = session_current();
    $sessionId = (string)($p['sessionId'] ?? ($sc['current']['sessionId'] ?? ''));
    if (!$memberId) return ['ok' => false, 'error' => 'no_member'];
    // End any current active links for this member+session.
    db_exec("UPDATE mentor_assignments SET status='ended', endedAt=? WHERE memberId=? AND sessionId=? AND status='active'", [now_iso(), $memberId, $sessionId]);
    if ($mentorId) {
        $mentor = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]);
        $track = $mentor && $mentor['tracks'] ? explode(',', (string)$mentor['tracks'])[0] : '';
        db_insert('mentor_assignments', ['memberId' => $memberId, 'mentorId' => $mentorId, 'track' => trim($track), 'sessionId' => $sessionId, 'status' => 'active', 'startedAt' => now_iso(), 'endedAt' => '']);
        push_notification($memberId, ['kind' => 'mentor', 'title' => 'You have a mentor', 'body' => ($mentor['fullName'] ?? 'A mentor') . ' is now guiding your Anchor journey.', 'linkPage' => 'dashboard']);
    }
    audit('admin.mentor.assign', $g['requester']['memberId'], $memberId, ['mentorId' => $mentorId, 'sessionId' => $sessionId], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Applications review ─────────────────────────────────────────────────────
function admin_applications_list(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['kind'])) { $where[] = 'kind = ?'; $params[] = $p['kind']; }
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    $sql = 'SELECT * FROM applications' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    return ['ok' => true, 'applications' => db_all($sql, $params)];
}

function admin_applications_set_status(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'reviewing', 'accepted', 'rejected', 'waitlist'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('applications', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.application.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_application_convert(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if ($a['kind'] !== 'teen') return ['ok' => false, 'error' => 'only_teen_apps'];   // mentor apps → mentors, handled separately
    // Don't double-provision.
    $existing = db_row('SELECT memberId FROM members WHERE lower(email) = ? LIMIT 1', [strtolower((string)$a['email'])]);
    if ($existing) { db_update('applications', ['status' => 'accepted'], ['id' => $id]); return ['ok' => true, 'memberId' => $existing['memberId'], 'existed' => true]; }
    $type = 'Summer';
    $newId = new_id($type === 'Summer' ? 'SUM' : 'NGG');
    db_insert('members', ['memberId' => $newId, 'fullName' => $a['name'], 'email' => $a['email'], 'type' => $type, 'status' => 'active', 'role' => 'member', 'centre' => $a['centre'] ?: 'Egbeda', 'track' => $a['track'] ?: '', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);
    audit('admin.application.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId];
}

// ── Newsletter ──────────────────────────────────────────────────────────────
function admin_newsletter_list(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $rows = db_all('SELECT email, source, status, createdAt FROM newsletter ORDER BY id DESC LIMIT 5000');
    return ['ok' => true, 'total' => count($rows), 'subscribers' => $rows];
}

// ── Site settings ───────────────────────────────────────────────────────────
function admin_settings_get(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => [
        'applications_open'        => (setting_raw('applications_open') ?? '1') !== '0',
        'mentor_applications_open' => (setting_raw('mentor_applications_open') ?? '1') !== '0',
        'featured_session_id'      => setting_raw('featured_session_id') ?? '',
    ]];
}

function admin_settings_set(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    foreach (['applications_open', 'mentor_applications_open', 'featured_session_id'] as $k) {
        if (array_key_exists($k, $data)) {
            $v = $data[$k];
            setting_set($k, is_bool($v) ? ($v ? '1' : '0') : (string)$v, $g['requester']['memberId']);
        }
    }
    audit('admin.settings.set', $g['requester']['memberId'], '', ['keys' => array_keys((array)$data)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
