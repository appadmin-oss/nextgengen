<?php
declare(strict_types=1);

/**
 * admin.members.record — one NGG member's whole record, for the Members
 * desk: attendance, conduct, money, curriculum, the companion's weekly
 * assessments, family, mentorship and their classes.
 *
 * Every one of these already existed behind its own op, each on its own
 * screen, so answering "how is this child doing?" meant visiting six sections
 * and knowing which one held what. This is the same data in one read, for
 * the person a staff member has open.
 *
 * Access follows the data, not the screen: the record needs `people` and the
 * member inside the reader's centres (admin_member_scope_gate); the money part
 * appears only for `fees` holders; conduct only where policy_subject_gate
 * allows. A part the reader may not see is absent, not empty — so the screen
 * can say "not yours to see" rather than "nothing here".
 */
const MEMBER_RECORD_DAYS = 60;

function admin_member_record(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $id = trim((string)($p['memberId'] ?? ''));
    $sg = admin_member_scope_gate($req, $id); if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    $caps = member_effective_caps($req);
    $today = attendance_today();
    $since = gmdate('Y-m-d', strtotime($today) - MEMBER_RECORD_DAYS * 86400);
    $out = ['ok' => true, 'memberId' => $id, 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre'],
            'course' => (string)($m['track'] ?? ''), 'type' => (string)$m['type'], 'status' => (string)$m['status'],
            'lastSignIn' => substr((string)($m['lastLoginAt'] ?? ''), 0, 10), 'days' => MEMBER_RECORD_DAYS, 'today' => $today];

    // Attendance: the days they came, and the absences the nightly sweep recorded.
    $att = db_all('SELECT date, status, checkInAt, checkOutAt, lateMinutes FROM attendance WHERE studentId = ? AND date >= ? ORDER BY date DESC', [$id, $since]);
    $absent = db_all("SELECT date, note FROM infractions WHERE personId = ? AND kind = 'absence' AND date >= ? AND COALESCE(voidedAt,'') = '' ORDER BY date DESC", [$id, $since]);
    $late = count(array_filter($att, static fn($a) => in_array((string)$a['status'], ['late', 'tardy'], true)));
    $out['attendance'] = ['present' => count($att), 'late' => $late, 'absent' => count($absent),
        'rate' => (count($att) + count($absent)) > 0 ? (int)round(100 * count($att) / (count($att) + count($absent))) : null,
        'recent' => array_slice(array_merge(
            array_map(static fn($a) => ['date' => (string)$a['date'], 'kind' => in_array((string)$a['status'], ['late', 'tardy'], true) ? 'late' : 'present',
                'in' => substr((string)$a['checkInAt'], 11, 5), 'out' => substr((string)$a['checkOutAt'], 11, 5), 'lateMinutes' => (int)($a['lateMinutes'] ?? 0)], $att),
            array_map(static fn($a) => ['date' => (string)$a['date'], 'kind' => 'absent', 'in' => '', 'out' => '', 'lateMinutes' => 0], $absent)), 0, 40)];
    usort($out['attendance']['recent'], static fn($a, $b) => strcmp($b['date'], $a['date']));

    // Conduct — where the reader may see it (policy_subject_gate decides by the member's real type).
    if (function_exists('policy_subject_gate') && policy_subject_gate($req, $id)['ok']) {
        $st = policy_state($id, 'member');
        $out['conduct'] = ['state' => (string)$st['state'], 'until' => (string)($st['until'] ?? ''), 'lates' => (int)$st['lates'], 'absences' => (int)$st['absences'],
            'absenceLimit' => (int)$st['absenceLimit'], 'finesOwed' => (int)$st['finesOwed'], 'awaitingReview' => !empty($st['awaitingReview']),
            'infractions' => db_all("SELECT id, kind, date, note, voidedAt FROM infractions WHERE personId = ? ORDER BY date DESC, id DESC LIMIT 15", [$id]),
            'sanctions' => db_all('SELECT id, kind, status, amount, reason, issuedAt, endsAt FROM sanctions WHERE personId = ? ORDER BY issuedAt DESC LIMIT 10', [$id])];
    }

    // Money — fees holders only (a separate trust; CLAUDE.md §4).
    if (in_array('fees', $caps, true) && function_exists('fees_balance')) {
        $entries = fees_entries($id);
        $b = fees_balance($m, null, null, $entries);
        $out['fees'] = ['payable' => (int)$b['payable'], 'outstanding' => (int)$b['outstanding'], 'charged' => (int)$b['charged'], 'credited' => (int)$b['credited'],
            'programmeCost' => (int)$b['programmeCost'], 'programmeCovered' => (int)$b['programmeCovered'], 'phase' => (string)($b['tenure']['phase'] ?? ''),
            'recent' => array_map(static fn($e) => ['date' => substr((string)$e['createdAt'], 0, 10), 'kind' => (string)$e['kind'], 'direction' => (string)$e['direction'],
                'amount' => (int)$e['amount'], 'note' => (string)($e['note'] ?? ''), 'voided' => (string)($e['voidedAt'] ?? '') !== ''], array_slice(array_reverse($entries), 0, 12))];
    }

    // Curriculum: how far through their course, and what is overdue.
    if (function_exists('curriculum_for_member')) {
        $c = curriculum_for_member($m);
        $out['curriculum'] = ['total' => (int)$c['total'], 'completed' => (int)$c['completed'], 'overdue' => (int)$c['overdue'], 'pct' => (int)$c['pct'],
            'overdueUnits' => array_values(array_map(static fn($u) => ['title' => (string)$u['title'], 'week' => (int)$u['week'], 'dueDate' => (string)$u['dueDate'], 'overdueDays' => (int)$u['overdueDays']],
                array_slice(array_filter($c['units'], static fn($u) => $u['overdueDays'] > 0), 0, 8))),
            'next' => (function () use ($c) { foreach ($c['units'] as $u) if (!$u['progress'] || $u['progress']['status'] !== 'completed') return ['title' => (string)$u['title'], 'week' => (int)$u['week']]; return null; })()];
    }

    // The companion's last six weekly assessments.
    $out['companion'] = array_map(static fn($r) => ['period' => (string)$r['period'], 'rating' => (string)$r['rating'], 'summary' => (string)$r['summary'],
            'focus' => safe_json((string)($r['focus'] ?? '')) ?: [], 'source' => (string)$r['source']],
        db_all('SELECT period, rating, summary, focus, source FROM member_assessments WHERE memberId = ? ORDER BY period DESC LIMIT 6', [$id]));

    // Family: who has a family account linked to this member, and its state.
    $out['family'] = db_all("SELECT g.fullName, g.email, w.relationship, w.status, w.createdAt FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                             WHERE w.memberId = ? AND w.status IN ('active','pending') ORDER BY w.id", [$id]);
    $out['guardian'] = ['name' => (string)($m['parentName'] ?? ''), 'email' => (string)($m['parentEmail'] ?? ''), 'phone' => (string)($m['parentPhone'] ?? '')];

    // Mentorship: the current mentor and how often they have met.
    $mentor = db_row("SELECT a.mentorId, a.startedAt, mt.fullName FROM mentor_assignments a LEFT JOIN mentors mt ON mt.mentorId = a.mentorId
                      WHERE a.memberId = ? AND a.status = 'active' ORDER BY a.id DESC LIMIT 1", [$id]);
    $meet = db_row('SELECT COUNT(*) c, MAX(metOn) last FROM mentor_meetings WHERE subjectId = ? AND metOn >= ?', [$id, gmdate('Y-m-d', strtotime($today) - 90 * 86400)]);
    $out['mentorship'] = ['mentor' => $mentor ? (string)($mentor['fullName'] ?? '') : '', 'since' => $mentor ? substr((string)$mentor['startedAt'], 0, 10) : '',
        'meetings90' => (int)($meet['c'] ?? 0), 'lastMet' => (string)($meet['last'] ?? '')];

    // Their classes: their course's slots on their centre's timetable.
    if (function_exists('tt_for_centre') && (string)$m['centre'] !== '') {
        $tt = tt_for_centre((string)$m['centre'], true, function_exists('curriculum_member_courses') ? curriculum_member_courses($m) : (string)($m['track'] ?? ''));
        $out['classes'] = array_values(array_filter($tt['slots'], static fn($s) => !empty($s['mine'])));
    }
    return $out;
}
