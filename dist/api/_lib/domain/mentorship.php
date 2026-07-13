<?php
declare(strict_types=1);

/**
 * Mentorship domain — the "people" surface for mentors, mentee pairing and the
 * mentor pipeline, wired to Afrovanguard's Street-To-Stardom (STS) mentorship.
 * NGG ("Next Gen") is a program inside STS, so mentors carry a `source`
 * ('ngg' | 'afrovanguard') and an optional STS reference. Gated by the
 * 'people' capability (see admin_role_caps).
 */

/** Full mentor record for admin views (public_mentor is the trimmed public one). */
function mentor_full(array $m): array {
    return [
        'mentorId' => $m['mentorId'],
        'fullName' => $m['fullName'] ?? '',
        'email' => $m['email'] ?? '',
        'phone' => $m['phone'] ?? '',
        'status' => $m['status'] ?? 'pending-checks',
        'tracks' => array_values(array_filter(array_map('trim', explode(',', (string)($m['tracks'] ?? ''))))),
        'centre' => $m['centre'] ?? '',
        'bio' => $m['bio'] ?? '',
        'photoUrl' => normalize_image_url($m['photoUrl'] ?? ''),
        'maxMentees' => (int)($m['maxMentees'] ?? 0),
        'availability' => $m['availability'] ?? '',
        'source' => $m['source'] ?? 'ngg',
        'program' => $m['program'] ?? '',
        'skills' => $m['skills'] ?? '',
        'linkedin' => $m['linkedin'] ?? '',
        'afrovanguardRef' => $m['afrovanguardRef'] ?? '',
        'joinedAt' => $m['joinedAt'] ?? '',
    ];
}

function mentorship_links(): array {
    $av = $GLOBALS['CONFIG']['afrovanguard'] ?? [];
    // NGG is the primary site. The parent-org / STS destinations aren't fully
    // set up, so anything not explicitly configured falls back to NGG's own
    // pages rather than pointing users at an unbuilt site.
    $ngg = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? 'https://next.afrovanguard.org.ng'), '/');
    return [
        'orgUrl'        => $av['org_url'] ?? 'https://afrovanguard.org.ng',
        'stsUrl'        => $av['sts_url'] ?? $ngg,
        'volunteerUrl'  => $av['volunteer_url'] ?? ($ngg . '/volunteer'),
        'mentorProgram' => $av['mentor_program'] ?? 'Street-To-Stardom · Next Gen',
    ];
}

// ── Public mentors directory (active mentors only) ──────────────────────────
function public_mentors(array $p): array {
    $rows = db_all("SELECT * FROM mentors WHERE status='active' ORDER BY fullName");
    $out = array_map(function ($m) {
        $pm = public_mentor($m);
        $pm['skills'] = array_values(array_filter(array_map('trim', explode(',', (string)($m['skills'] ?? '')))));
        $pm['program'] = $m['program'] ?? '';
        $pm['source'] = $m['source'] ?? 'ngg';
        return $pm;
    }, $rows);
    return ['ok' => true, 'mentors' => $out, 'afrovanguard' => mentorship_links()];
}

// ── Mentorship overview ──────────────────────────────────────────────────────
function admin_mentorship_overview(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $sc = session_current();
    $sessionId = (string)($sc['current']['sessionId'] ?? '');

    $total     = $one("SELECT COUNT(*) c FROM mentors");
    $active    = $one("SELECT COUNT(*) c FROM mentors WHERE status='active'");
    $pending   = $one("SELECT COUNT(*) c FROM mentors WHERE status='pending-checks'");
    $fromAv    = $one("SELECT COUNT(*) c FROM mentors WHERE source='afrovanguard'");
    $apps      = $one("SELECT COUNT(*) c FROM applications WHERE kind='mentor' AND status IN ('new','reviewing')");
    $capacity  = (int)(db_row("SELECT SUM(maxMentees) c FROM mentors WHERE status='active'")['c'] ?? 0);
    $paired    = $one("SELECT COUNT(*) c FROM mentor_assignments WHERE status='active'");
    // Active members without an active mentor this session.
    $unassigned = $one(
        "SELECT COUNT(*) c FROM members m WHERE m.status='active' AND m.role='member'
         AND NOT EXISTS (SELECT 1 FROM mentor_assignments ma WHERE ma.memberId=m.memberId AND ma.status='active' AND ma.sessionId=?)",
        [$sessionId]
    );
    $byProgram = db_all("SELECT COALESCE(NULLIF(program,''),'—') program, COUNT(*) c FROM mentors GROUP BY program");

    return ['ok' => true, 'overview' => [
        'total' => $total, 'active' => $active, 'pending' => $pending, 'fromAfrovanguard' => $fromAv,
        'applications' => $apps, 'capacity' => $capacity, 'paired' => $paired,
        'openSeats' => max(0, $capacity - $paired), 'unassignedMembers' => $unassigned,
        'byProgram' => $byProgram,
        'afrovanguard' => mentorship_links(),
    ]];
}

// ── Mentor roster (with mentee load) ─────────────────────────────────────────
function admin_mentorship_roster(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $sc = session_current();
    $sessionId = (string)($p['sessionId'] ?? ($sc['current']['sessionId'] ?? ''));
    $rows = db_all('SELECT * FROM mentors ORDER BY status, fullName');
    $out = [];
    foreach ($rows as $m) {
        $rec = mentor_full($m);
        $mentees = db_all(
            "SELECT ma.memberId, ma.track, mem.fullName, mem.centre FROM mentor_assignments ma
             LEFT JOIN members mem ON mem.memberId = ma.memberId
             WHERE ma.mentorId = ? AND ma.status='active' AND ma.sessionId = ?
             ORDER BY mem.fullName",
            [$m['mentorId'], $sessionId]
        );
        $rec['mentees'] = array_map(fn($x) => ['memberId' => $x['memberId'], 'fullName' => $x['fullName'] ?: $x['memberId'], 'centre' => $x['centre'] ?? '', 'track' => $x['track'] ?? ''], $mentees);
        $rec['menteeCount'] = count($mentees);
        $rec['openSeats'] = max(0, ((int)($m['maxMentees'] ?? 0)) - count($mentees));
        $out[] = $rec;
    }
    // Members with no active mentor this session (assignable pool).
    $unassigned = db_all(
        "SELECT m.memberId, m.fullName, m.centre, m.track FROM members m
         WHERE m.status='active' AND m.role='member'
         AND NOT EXISTS (SELECT 1 FROM mentor_assignments ma WHERE ma.memberId=m.memberId AND ma.status='active' AND ma.sessionId=?)
         ORDER BY m.fullName LIMIT 500",
        [$sessionId]
    );
    return ['ok' => true, 'mentors' => $out, 'unassigned' => $unassigned, 'sessionId' => $sessionId, 'afrovanguard' => mentorship_links()];
}

// ── Convert a mentor application into a mentor record ────────────────────────
function admin_mentor_application_convert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if (($a['kind'] ?? '') !== 'mentor') return ['ok' => false, 'error' => 'only_mentor_apps'];

    $existing = db_row('SELECT mentorId FROM mentors WHERE lower(email) = ? LIMIT 1', [strtolower((string)$a['email'])]);
    if ($existing) { db_update('applications', ['status' => 'accepted'], ['id' => $id]); return ['ok' => true, 'mentorId' => $existing['mentorId'], 'existed' => true]; }

    $links = mentorship_links();
    $newId = new_id('MEN');
    db_insert('mentors', [
        'mentorId' => $newId, 'fullName' => $a['name'], 'email' => $a['email'],
        'status' => 'pending-checks', 'tracks' => (string)($a['role'] ?? ''), 'centre' => $a['centre'] ?: '',
        'bio' => (string)($a['why'] ?? ''), 'maxMentees' => 3,
        'source' => 'afrovanguard', 'program' => $links['mentorProgram'],
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);
    @send_mail((string)$a['email'], 'Welcome to the Afrovanguard mentor network',
        email_template([
            'title' => 'Thank you for stepping up, ' . explode(' ', (string)$a['name'])[0] . '.',
            'intro' => 'Your mentor application has been accepted.',
            'bodyHtml' => 'We\'ll be in touch to complete safeguarding checks before pairing you with mentees. '
                . 'NGG mentorship runs inside Afrovanguard\'s ' . esc_html($links['mentorProgram']) . '.',
            'ctaLabel' => 'Afrovanguard volunteer hub', 'ctaUrl' => $links['volunteerUrl'],
            'footNote' => 'Welcome to the network.',
        ]));
    audit('admin.mentor.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'mentorId' => $newId];
}
