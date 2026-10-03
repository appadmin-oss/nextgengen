<?php
declare(strict_types=1);

/*
 * One check-in for everyone.
 *
 * Every desk in the app — the gate link, the Summer kiosk, "Mark present" on a
 * profile — writes through summer_checkin(), and summer_checkin() only knew
 * Summer School's qr_codes (SUMQR-/VOLQR-). An NGG member's card lives in
 * member_cards (MEMQR-) or is an older printed number, so every member scan
 * ended as qr_unassigned. Members got attendance only when a centre ran the
 * CACENTRE gate, whose resolver (hooks_gate_resolve) was a server-to-server
 * contract no NGG screen called.
 *
 * So: when a scan is not a Summer/volunteer card, summer_checkin() asks
 * checkin_member_resolve() whether it is a member, and checkin_member() takes
 * the roll. Same `attendance` table — it already holds member rows, and every
 * reader (policy sweep, member dashboard, Club counts) reads it — same
 * punctuality and sanction engine the CACENTRE webhook applies to members.
 *
 * Who may take it follows who owns the record (CLAUDE.md §4): a member's
 * attendance is the Club's, so a console check-in needs `club`; a gate link
 * authorises by the gate, as it does for everyone else.
 */

/** The value inside whatever a scanner yields: a /q/<x> or /s/<x> URL, a
 *  ?m=<x> link (the older member dashboard card), or the bare text. */
function checkin_scan_value(string $raw): string {
    $s = trim($raw);
    if (preg_match('~[?&]m=([^&#\s]+)~i', $s, $m)) return strtoupper(rawurldecode($m[1]));
    if (preg_match('~/(?:q|s)/([^/?#\s]+)~i', $s, $m)) return strtoupper(rawurldecode($m[1]));
    return strtoupper($s);
}

/**
 * The NGG member a scanned or typed code belongs to, or null.
 *
 * In order: a secure MEMQR- card; the raw text against each of NGG's printed
 * card formats (the same formats the CACENTRE gate decodes with); then a typed
 * printed ID (026-014) or memberId. Summer accounts (SUM-) are never members
 * here — that would give one person two identities at one door.
 *
 * @return array{member:array,void:bool,how:string}|null
 */
function checkin_member_resolve(string $raw): ?array {
    $raw = trim($raw);
    if ($raw === '' || strlen($raw) > 2000) return null;
    $v = checkin_scan_value($raw);
    if (strpos($v, 'MEMQR-') === 0) {
        $hit = member_card_lookup($v);
        return $hit ? ['member' => $hit['member'], 'void' => $hit['void'], 'how' => 'secure'] : null;
    }
    foreach (member_card_formats() as $f) {
        $code = member_card_format_decode($f, $raw);
        if ($code === null || $code === '') continue;
        $hit = member_card_lookup(null, (string)$f['id'], $code);
        if ($hit) return ['member' => $hit['member'], 'void' => $hit['void'], 'how' => 'printed'];
    }
    $id = member_id_canonical($v);
    $m = db_row("SELECT * FROM members WHERE (UPPER(displayId) = ? OR UPPER(memberId) = ?) AND COALESCE(type,'NGG') <> 'Summer' LIMIT 1", [$id, $id]);
    $m = $m ? member_follow_merge($m) : null;
    return $m ? ['member' => $m, 'void' => false, 'how' => 'typed'] : null;
}

/** The shape the desks render, aligned with summer_student_public / volunteer_public. */
function checkin_member_public(array $m): array {
    return [
        'kind' => 'member', 'studentId' => (string)$m['memberId'], 'memberId' => (string)$m['memberId'],
        'displayId' => (string)($m['displayId'] ?? ''), 'fullName' => (string)($m['fullName'] ?? ''),
        'centre' => (string)($m['centre'] ?? ''), 'track' => (string)($m['track'] ?? ''),
        'photoUrl' => normalize_image_url((string)($m['photoUrl'] ?? '')), 'status' => (string)($m['status'] ?: 'active'),
    ];
}

/** Who may take a member's roll: a gate link, or staff holding `club`. */
function checkin_member_actor(array $p): array {
    if (!empty($p['gateAuthorized'])) return ['ok' => true, 'byId' => substr((string)($p['byId'] ?? 'kiosk'), 0, 64) ?: 'kiosk'];
    $g = admin_cap_gate($p, 'club');
    return $g['ok'] ? ['ok' => true, 'byId' => (string)$g['requester']['memberId']] : $g;
}

/** Check a resolved member in. Mirrors summer_checkin()'s contract. */
function checkin_member(array $p, array $hit): array {
    $a = checkin_member_actor($p); if (!$a['ok']) return $a;
    $byId = $a['byId'];
    $m = $hit['member'];
    $pub = checkin_member_public($m);
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'student_not_found'];
    if ($hit['void']) return ['ok' => false, 'error' => 'card_void', 'student' => $pub,
        'message' => 'This card has been replaced. Ask for the new one, or type the member ID.'];
    $status = strtolower((string)($m['status'] ?: 'active'));
    if ($status !== 'active') return ['ok' => false, 'error' => 'member_inactive', 'student' => $pub,
        'message' => 'This membership is ' . $status . '.'];

    $mid = (string)$m['memberId'];
    $at = attendance_scan_time($p['scannedAt'] ?? null);
    $today = attendance_today($at);
    $scanIso = gmdate('Y-m-d\\TH:i:s\\Z', $at);
    $existing = db_row('SELECT status, lateMinutes FROM attendance WHERE studentId = ? AND date = ?', [$mid, $today]);
    if ($existing) {
        return ['ok' => true, 'already' => true, 'student' => $pub, 'status' => (string)($existing['status'] ?: 'present'),
                'lateMinutes' => (int)($existing['lateMinutes'] ?? 0), 'halfDay' => 0,
                'programmeDay' => policy_is_day($today, 'member'), 'compliance' => policy_state($mid, 'member')];
    }
    $gate = policy_gate_checkin($mid, 'member');
    if (!$gate['ok']) return $gate + ['student' => $pub];
    /* Graded on the member's own weekly calendar and switch — as the
       CACENTRE webhook does — and recorded as plain presence otherwise. */
    $apply = policy_enabled_for('member') && policy_is_day($today, 'member');
    $punc = $apply ? policy_punctuality('member', $at) : ['status' => 'present', 'lateMinutes' => 0, 'redline' => 0, 'halfDay' => 0];
    try {
        db_insert('attendance', ['cohortId' => '', 'studentId' => $mid, 'token' => substr(checkin_scan_value((string)($p['token'] ?? '')), 0, 120),
            'date' => $today, 'checkInAt' => $scanIso, 'method' => (string)($p['method'] ?? 'qr'), 'byId' => $byId,
            'device' => substr((string)($p['device'] ?? ''), 0, 64), 'status' => $punc['status'], 'lateMinutes' => (int)$punc['lateMinutes'],
            'redline' => (int)$punc['redline'], 'halfDay' => (int)$punc['halfDay'], 'createdAt' => now_iso()]);
    } catch (\Throwable $e) {
        if (!attendance_is_dup($e)) throw $e;
        $row = db_row('SELECT status, lateMinutes FROM attendance WHERE studentId = ? AND date = ?', [$mid, $today]);
        return ['ok' => true, 'already' => true, 'student' => $pub, 'status' => (string)($row['status'] ?? 'present'), 'lateMinutes' => (int)($row['lateMinutes'] ?? 0)];
    }
    audit('member.checkin', $byId, $mid, ['date' => $today, 'status' => $punc['status'], 'how' => $hit['how']], (string)($p['ip'] ?? ''));
    if ($apply) policy_on_checkin($mid, 'member', $today, $punc);
    event_emit('attendance.marked', ['memberId' => $mid, 'name' => $pub['fullName'], 'date' => $today, 'source' => (string)($p['method'] ?? 'qr')]);
    return ['ok' => true, 'already' => false, 'student' => $pub, 'status' => $punc['status'], 'lateMinutes' => (int)$punc['lateMinutes'],
            'halfDay' => (int)$punc['halfDay'], 'programmeDay' => policy_is_day($today, 'member'), 'compliance' => policy_state($mid, 'member'),
            /* An old printed card is a number anybody could write down; the
               desk says so, so somebody glances at the face. */
            'printedCard' => $hit['how'] === 'printed'];
}

/** Stamp a member's departure. Not expiry- or status-gated, like summer_checkout. */
function checkin_member_checkout(array $p, array $hit): array {
    $a = checkin_member_actor($p); if (!$a['ok']) return $a;
    $mid = (string)$hit['member']['memberId'];
    $today = attendance_today();
    $row = db_row('SELECT * FROM attendance WHERE studentId = ? AND date = ?', [$mid, $today]);
    if (!$row) return ['ok' => false, 'error' => 'not_checked_in'];
    if (!empty($row['checkOutAt'])) return ['ok' => true, 'already' => true, 'checkOutAt' => $row['checkOutAt']];
    db_update('attendance', ['checkOutAt' => now_iso()], ['id' => $row['id']]);
    audit('member.checkout', $a['byId'], $mid, ['date' => $today], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'already' => false, 'checkOutAt' => now_iso(), 'student' => checkin_member_public($hit['member'])];
}
