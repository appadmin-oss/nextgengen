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
                'programmeDay' => policy_is_day_for($mid, $today, 'member'), 'compliance' => policy_state($mid, 'member')];
    }
    $gate = policy_gate_checkin($mid, 'member');
    if (!$gate['ok']) return $gate + ['student' => $pub];
    /* Graded on the member's own weekly calendar and switch — as the
       CACENTRE webhook does — and recorded as plain presence otherwise. */
    // Their centre's days, not one calendar for every centre.
    $apply = policy_enabled_for('member') && policy_is_day_for($mid, $today, 'member');
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
    checkin_member_email($m, 'in', $at, $punc);
    return ['ok' => true, 'already' => false, 'student' => $pub, 'status' => $punc['status'], 'lateMinutes' => (int)$punc['lateMinutes'],
            'halfDay' => (int)$punc['halfDay'], 'programmeDay' => policy_is_day_for($mid, $today, 'member'), 'compliance' => policy_state($mid, 'member'),
            /* An old printed card is a number anybody could write down; the
               desk says so, so somebody glances at the face. */
            'printedCard' => $hit['how'] === 'printed'];
}

/** Stamp a member's departure. Not expiry- or status-gated, like summer_checkout. */
function checkin_member_checkout(array $p, array $hit): array {
    $a = checkin_member_actor($p); if (!$a['ok']) return $a;
    $mid = (string)$hit['member']['memberId'];
    $at = attendance_scan_time($p['scannedAt'] ?? null);
    $today = attendance_today($at);
    $row = db_row('SELECT * FROM attendance WHERE studentId = ? AND date = ?', [$mid, $today]);
    if (!$row) return ['ok' => false, 'error' => 'not_checked_in'];
    if (!empty($row['checkOutAt'])) return ['ok' => true, 'already' => true, 'checkOutAt' => $row['checkOutAt']];
    if ($no = attendance_checkout_refusal('member', $at, $p)) return $no + ['student' => checkin_member_public($hit['member'])];
    $outIso = gmdate('Y-m-d\\TH:i:s\\Z', $at);
    db_update('attendance', ['checkOutAt' => $outIso], ['id' => $row['id']]);
    $early = trim((string)($p['earlyReason'] ?? ''));
    audit($early !== '' && attendance_close_time('member') !== '' ? 'attendance.early_checkout' : 'member.checkout', $a['byId'], $mid,
          ['date' => $today] + ($early !== '' ? ['reason' => mb_substr($early, 0, 200)] : []), (string)($p['ip'] ?? ''));
    checkin_member_email($hit['member'], 'out', $at, ['checkInAt' => (string)$row['checkInAt']]);
    return ['ok' => true, 'already' => false, 'checkOutAt' => $outIso, 'student' => checkin_member_public($hit['member'])];
}

/**
 * Tell an NGG member — and their parent, where one is on the record — that
 * they signed in or out, and when. The member gets it because a record of
 * their own attendance is theirs; the parent because a child signing out at
 * the gate is the moment a parent most wants to know about.
 *
 * Off with the same switch as the Summer School's check-in notes
 * (`checkin_state_emails`). Never blocks the desk: send_mail never throws.
 */
function checkin_member_email(array $m, string $dir, int $at, array $facts = []): void {
    if (!checkin_emails_enabled()) return;
    $to = [];
    foreach ([(string)($m['email'] ?? ''), (string)($m['parentEmail'] ?? '')] as $e) {
        $e = strtolower(trim($e));
        if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL) && !in_array($e, $to, true)) $to[] = $e;
    }
    if (!$to) return;
    $first = esc_html(explode(' ', trim((string)($m['fullName'] ?? '')))[0] ?: 'You');
    $clock = attendance_clock($at);
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    if ($dir === 'in') {
        $status = (string)($facts['status'] ?? 'present');
        $late = (int)($facts['lateMinutes'] ?? 0);
        $subject = "{$first} signed in at {$clock}";
        $line = $status === 'late' || $status === 'tardy'
            ? "That is <b>{$late} minute" . ($late === 1 ? '' : 's') . " after resumption</b>, and it is recorded as " . esc_html($status) . "."
            : 'On time — thank you.';
        $close = attendance_close_time('member');
        $body = "<p style=\"margin:0 0 10px\">{$line}</p>"
              . ($close !== '' ? "<p style=\"margin:0 0 10px\">Sign-out opens at <b>{$close}</b>. Leaving before then means there is no sign-out for today, which counts against attendance.</p>" : '');
        $title = 'Signed in';
    } else {
        $inAt = strtotime((string)($facts['checkInAt'] ?? ''));
        $stay = $inAt ? max(0, intdiv($at - $inAt, 60)) : 0;
        $subject = "{$first} signed out at {$clock}";
        $body = '<p style="margin:0 0 10px">' . ($stay > 0 ? 'Time at the centre today: <b>' . intdiv($stay, 60) . 'h ' . ($stay % 60) . 'm</b>.' : 'Signed out for today.') . '</p>';
        $title = 'Signed out';
    }
    $html = email_template([
        'title' => $title, 'eyebrow' => 'NGG Club · ' . esc_html((string)($m['centre'] ?? '')),
        'intro' => $dir === 'in' ? "{$first} signed in at the centre at {$clock}." : "{$first} signed out of the centre at {$clock}.", 'bodyHtml' => $body,
        'ctaLabel' => 'Open my dashboard →', 'ctaUrl' => $origin . '/dashboard',
        'footNote' => 'You are receiving this because this address is on an NGG member\'s record. Attendance notes can be switched off by the programme.',
    ]);
    foreach ($to as $addr) @send_mail($addr, $subject, $html);
}
