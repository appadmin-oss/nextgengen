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
    $newId = new_id('NGG');
    db_insert('members', [
        'memberId' => $newId, 'fullName' => $s['fullName'], 'email' => '', 'type' => 'NGG',
        'status' => 'active', 'role' => 'member', 'centre' => $s['centre'] ?: 'Egbeda',
        'track' => $s['track'] ?: '', 'photoUrl' => $s['photoUrl'] ?: '',
        'notes' => 'Promoted from Summer ' . $s['studentId'] . ' (' . $s['cohortId'] . ')',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ]);
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
