<?php
declare(strict_types=1);

/**
 * NGG Club coordinator domain — the Summer → Club bridge and club roster.
 * A Summer School student's record can be promoted into a full NGG member
 * (carrying name / photo / track / centre). Gated by the 'club' capability
 * (club_admin / admin / super_admin).
 */

function admin_club_overview(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    return ['ok' => true, 'overview' => [
        'members'    => $one("SELECT COUNT(*) c FROM members WHERE type='NGG' AND status='active'"),
        'promotable' => $one("SELECT COUNT(*) c FROM summer_students WHERE status IN ('active','graduated')"),
        'promoted'   => $one("SELECT COUNT(*) c FROM summer_students WHERE status='promoted'"),
        'mentors'    => $one("SELECT COUNT(*) c FROM mentors WHERE status='active'"),
    ]];
}

/** Summer students eligible to be enrolled into the Club (not yet promoted). */
function admin_club_promotable(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM summer_students WHERE status IN ('active','graduated') ORDER BY status DESC, fullName");
    return ['ok' => true, 'students' => array_map(fn($s) => summer_student_public($s, true), $rows)];
}

/** Promote a summer student into a full NGG Club member. */
function admin_club_promote(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $sid = (string)($p['studentId'] ?? '');
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$sid]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (($s['status'] ?? '') === 'promoted') return ['ok' => false, 'error' => 'already_promoted'];
    $newId = new_id('NGG', 'members', 'memberId');
    /* Carry the record across.
     *
     * This wrote `email => ''` — literally blank — so a child promoted out of
     * Summer got a member row nobody could sign into: the only sign-in routes
     * are a password they have never set and a code emailed to an address that
     * is not there. Their guardian's email and phone were on the summer_students
     * row the whole time, along with a date of birth, and the dues reminders and
     * guardian nudges both select on parentEmail — so a promoted member was
     * invisible to those too.
     *
     * The guardian's address becomes the member's contact, exactly as it does
     * on the teen application path: it is the one address the programme holds
     * for a ten- to seventeen-year-old, and having it in both places is what
     * makes sign-in and the reminders work at once. */
    $guardianEmail = trim((string)($s['parentEmail'] ?? ''));
    $guardianPhone = trim((string)($s['guardianPhone'] ?? ''));
    db_insert('members', [
        'memberId' => $newId, 'fullName' => $s['fullName'],
        'email' => $guardianEmail, 'type' => 'NGG',
        'status' => 'active', 'role' => 'member', 'centre' => $s['centre'] ?: 'Egbeda',
        'track' => $s['track'] ?: '', 'photoUrl' => $s['photoUrl'] ?: '',
        'dob' => (string)($s['dob'] ?? ''),
        'parentName' => (string)($s['guardianName'] ?? ''),
        'parentEmail' => $guardianEmail,
        'parentPhone' => $guardianPhone,
        'joinDate' => gmdate('Y-m-d'),
        'notes' => 'Promoted from Summer ' . $s['studentId'] . ' (' . $s['cohortId'] . ')',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);

    /* And a way in, when there is an address to send it to. Same set-password
       link the application path mints, for the same reason: otherwise every
       sign-in is a code in a guardian's inbox. */
    $welcome = ($guardianEmail !== '' && function_exists('auth_welcome_link')) ? auth_welcome_link($newId) : '';
    if ($welcome !== '') {
        @send_mail($guardianEmail, 'Welcome to the NGG club',
            email_template([
                'title' => explode(' ', (string)$s['fullName'])[0] . ' is in the club.',
                'intro' => 'Promoted from Summer Students into Next Generation Genius.',
                'bodyHtml' => 'The member ID is <b>' . esc_html($newId) . '</b>. Set a password with the button '
                    . 'below — after that they can sign in with the member ID alone. The link is good for seven days.',
                'ctaLabel' => 'Set a password', 'ctaUrl' => $welcome,
                'footNote' => 'Welcome to the movement.',
            ]));
    }
    db_update('summer_students', ['status' => 'promoted', 'updatedAt' => now_iso()], ['studentId' => $sid]);
    audit('club.promote', $g['requester']['memberId'], $newId, ['fromSummer' => $sid], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId];
}

function admin_club_members(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $q = strtolower((string)($p['q'] ?? ''));
    $where = ["type='NGG'", "status='active'"]; $params = [];
    if ($q !== '') { $where[] = '(lower(fullName) LIKE ? OR lower(memberId) LIKE ?)'; $like = '%' . $q . '%'; array_push($params, $like, $like); }
    $rows = db_all('SELECT * FROM members WHERE ' . implode(' AND ', $where) . ' ORDER BY createdAt DESC LIMIT 1000', $params);
    return ['ok' => true, 'members' => array_map('public_member', $rows)];
}
