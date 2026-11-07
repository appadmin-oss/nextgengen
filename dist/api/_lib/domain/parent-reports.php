<?php
/**
 * Formal family reports, and the daily attendance mail to staff (owner, 7 Nov 2026: "the parents should get a
 * formal professional report at the end of each session and every month. Super profesh", "monthly parent reports —
 * with fines and dues and so on", and "email reports on every programme … on the attendance for the day").
 *
 * THREE REPORTS, ONE SHAPE.
 *   month    an NGG member, the calendar month just ended — on the first days of the next month.
 *   session  an NGG member, a session (term, `sessions` row) — in the days after it ends.
 *   edition  a Summer School participant, their edition — in the days after its season ends.
 * Each is built once from the records (attendance, unexcused absences, lessons, exams, certificates, conduct,
 * fines, dues and payments, the balance) and SEALED in parent_reports. The copy a parent reopens next year is the
 * copy they were sent: a payment recorded later does not rewrite what the report said the balance was that day.
 *
 * SENDING. Each recipient is claimed in report_sends before the mail goes (UNIQUE kind, refKey, recipient), so
 * a 15-minute tick sends each report once whatever overlaps. A member report also lands in the family inbox as a
 * signable notice — the existing monthly "sign it" loop — pointing at the full report.
 *
 * THE DAILY ATTENDANCE MAIL. After the day's session ends (PREPORT_DAILY_HOUR, Lagos), on a programme day, each
 * member of staff holding the programme's capability gets one mail: per centre in their scope, who was expected,
 * who came, who was late, who is absent (named), who never signed out. Club → `checkin`; Summer School → `summer`.
 * A coordinator scoped to two centres sees those two, never the rest.
 */

const PREPORT_KINDS = ['month', 'session', 'edition'];
const PREPORT_SESSION_GRACE_DAYS = 10;     // a session or edition report is still made this long after it ends
const PREPORT_DAILY_HOUR = 17;             // Lagos hour after which the day's attendance mail goes
const PREPORT_BATCH = 120;                 // reports per tick — a shared host is not a mail server

/* ── Small helpers ─────────────────────────────────────────────────────── */

function preport_claim(string $kind, string $refKey, string $recipient): bool {
    $recipient = mb_strtolower(trim($recipient));
    if ($recipient === '') return false;
    try {
        db_insert('report_sends', ['kind' => $kind, 'refKey' => mb_substr($refKey, 0, 120), 'recipient' => mb_substr($recipient, 0, 191), 'sentAt' => now_iso()]);
        return true;
    } catch (Throwable $e) {
        return false;   // already claimed — by an earlier tick or one running beside this
    }
}

/** ₦ with a thousands separator, no space, no kobo (SPEC: currency formatting). */
function preport_money(int $n): string { return function_exists('fees_money_text') ? fees_money_text($n) : '₦' . number_format($n); }
/** A ledger line in words a parent reads: "Charged: monthly dues", "Payment received". */
function preport_ledger_label(string $kind, string $note, bool $charge): string {
    $base = ['membership' => 'membership fee', 'dues' => 'monthly dues', 'fine' => 'fine', 'adjustment' => 'adjustment', 'payment' => 'Payment received', 'waiver' => 'Waived'][$kind] ?? $kind;
    // A reason is what staff wrote: printed as written, never re-cased.
    if (!$charge) return $base . ($note !== '' && $kind !== 'payment' ? ' — ' . $note : '');
    return 'Charged: ' . $base . ($kind === 'fine' && $note !== '' ? ' — ' . $note : '');
}
/** "Fri 10 Oct 2026" (SPEC: day log format). */
function preport_day(string $d): string { $t = strtotime(substr($d, 0, 10) . ' 12:00:00 UTC'); return $t ? gmdate('D j M Y', $t) : $d; }
/** "1 October – 31 October 2026" (SPEC: reporting period). */
function preport_span(string $a, string $b): string {
    $x = strtotime($a . ' 12:00:00 UTC'); $y = strtotime($b . ' 12:00:00 UTC');
    if (!$x || !$y) return $a . ' – ' . $b;
    return gmdate('Y', $x) === gmdate('Y', $y) ? gmdate('j F', $x) . ' – ' . gmdate('j F Y', $y) : gmdate('j F Y', $x) . ' – ' . gmdate('j F Y', $y);
}
function preport_date(string $d): string { $t = strtotime(substr($d, 0, 10) . ' 12:00:00 UTC'); return $t ? gmdate('j M Y', $t) : $d; }
function preport_pct(int $a, int $b): ?int { return $b > 0 ? (int)round(100 * $a / $b) : null; }

/** The calendar month before `$today`: [period, from, to, label]. */
function preport_last_month(string $today): array {
    $first = substr($today, 0, 7) . '-01';
    $to = gmdate('Y-m-d', strtotime($first . ' 12:00:00 UTC') - 86400);
    $from = substr($to, 0, 7) . '-01';
    return [substr($to, 0, 7), $from, $to, gmdate('F Y', strtotime($from . ' 12:00:00 UTC'))];
}

/* ── Building a member's report ────────────────────────────────────────── */

/**
 * Everything a member report says, read from the records for [from, to]. Pure read: nothing is written.
 * `asOf` is the day the money section is true on (the day the report is made).
 */
function preport_member_data(array $m, string $from, string $to, string $kind, string $label, ?string $asOf = null): array {
    $mid = (string)$m['memberId'];
    $asOf = $asOf ?? attendance_today();
    $upto = min($to, $asOf);
    // Attendance: the member's own programme days, the scans on them, and what was excused.
    $cal = function_exists('member_calendar_for') ? member_calendar_for($m) : ['enabled' => false];
    $days = !empty($cal['enabled']) && function_exists('programme_days_between') ? programme_days_between($from, $upto, $cal) : [];
    $scans = [];
    foreach (db_all('SELECT date, status, checkInAt, checkOutAt, lateMinutes, halfDay FROM attendance WHERE studentId = ? AND date BETWEEN ? AND ? ORDER BY date', [$mid, $from, $upto]) as $s) $scans[(string)$s['date']] = $s;
    $unexcused = function_exists('policy_unexcused_absences') ? policy_unexcused_absences($mid, $from, $upto) : [];
    $register = []; $present = 0; $late = 0; $noOut = 0;
    foreach ($days as $d) {
        $s = $scans[$d] ?? null;
        if ($s) {
            $present++;
            $isLate = in_array((string)$s['status'], ['late', 'tardy'], true);
            if ($isLate) $late++;
            $out = trim((string)($s['checkOutAt'] ?? '')) !== '';
            if (!$out) $noOut++;
            $note = $isLate && (int)$s['lateMinutes'] > 0 ? 'Arrived ' . (int)$s['lateMinutes'] . ' min late' : '';
            if (!$out) $note = trim($note . ($note !== '' ? '; ' : '') . 'Did not sign out');
            $register[] = ['date' => $d, 'mark' => $isLate ? 'Late' : 'Present', 'tag' => $isLate ? 'warn' : 'ok', 'detail' => $note];
        } else {
            $cover = function_exists('member_absence_cover') ? (string)member_absence_cover($mid, $d) : '';
            $excused = in_array($cover, ['approved', 'academic'], true);
            $register[] = in_array($d, $unexcused, true) ? ['date' => $d, 'mark' => 'Absent (unexcused)', 'tag' => 'bad', 'detail' => '']
                : ($excused ? ['date' => $d, 'mark' => 'Absent (excused)', 'tag' => 'neutral', 'detail' => $cover === 'academic' ? 'School commitment' : 'Absence approved']
                            : ['date' => $d, 'mark' => 'Absent', 'tag' => 'bad', 'detail' => '']);
        }
    }
    $absent = count($days) - $present;

    // Learning: lessons completed in the period, exams sat, certificates issued, where they stand overall.
    $lessons = db_all("SELECT u.title, u.course, p.bestPct, p.completedAt FROM curriculum_progress p JOIN curriculum_units u ON u.unitId = p.unitId
                       WHERE p.memberId = ? AND p.status = 'completed' AND substr(p.completedAt, 1, 10) BETWEEN ? AND ? ORDER BY p.completedAt", [$mid, $from, $to]);
    $exams = db_all("SELECT s.course, s.kind, s.pct, s.band, s.submittedAt, u.title FROM curriculum_sittings s LEFT JOIN curriculum_units u ON u.unitId = s.unitId
                     WHERE s.memberId = ? AND s.status <> 'open' AND substr(s.submittedAt, 1, 10) BETWEEN ? AND ? ORDER BY s.submittedAt", [$mid, $from, $to]);
    $certs = db_all("SELECT docNo, data, issuedAt FROM documents WHERE memberId = ? AND status = 'issued' AND substr(issuedAt, 1, 10) BETWEEN ? AND ? ORDER BY issuedAt", [$mid, $from, $to]);
    $overall = function_exists('curriculum_for_member') ? curriculum_for_member($m) : ['completed' => 0, 'total' => 0, 'overdue' => 0];

    // Conduct: the record for the period — infractions and the sanctions they led to.
    $sanctions = db_all("SELECT kind, reason, amount, status, issuedAt FROM sanctions WHERE personId = ? AND substr(issuedAt, 1, 10) BETWEEN ? AND ? ORDER BY issuedAt", [$mid, $from, $to]);

    // Money: what was charged, what was received, in the period; and the account as it stands today.
    $charged = []; $received = []; $fines = []; $lines = [];
    foreach (db_all("SELECT kind, direction, amount, note, createdAt FROM member_ledger WHERE memberId = ? AND (voidedAt IS NULL OR voidedAt = '')
                     AND substr(createdAt, 1, 10) BETWEEN ? AND ? ORDER BY id", [$mid, $from, $to]) as $e) {
        $k = (string)$e['kind'];
        if ($k === 'training' || $k === 'writeoff') continue;   // the training place is its own account
        $date = substr((string)$e['createdAt'], 0, 10); $amt = (int)$e['amount'];
        if ((string)$e['direction'] === 'charge') {
            $charged[$k] = ($charged[$k] ?? 0) + $amt;
            if ($k === 'fine') $fines[] = ['date' => $date, 'reason' => (string)$e['note'], 'amount' => $amt];
            $lines[] = ['what' => preport_ledger_label($k, (string)$e['note'], true), 'date' => $date, 'amount' => $amt, 'credit' => false];
        } else {
            $received[$k] = ($received[$k] ?? 0) + $amt;
            $lines[] = ['what' => preport_ledger_label($k, (string)$e['note'], false), 'date' => $date, 'amount' => $amt, 'credit' => true];
        }
    }
    usort($lines, static fn($a, $b) => strcmp($b['date'], $a['date']));   // newest first (SPEC: "newest first in This period")
    $payable = 0; $credit = 0; $open = [];
    if (function_exists('fees_balance')) {
        try {
            $bal = fees_balance($m);
            $payable = max(0, (int)($bal['payable'] ?? 0));
            if (function_exists('fees_account_statement')) {
                $stmt = fees_account_statement($m, $bal);
                $credit = $payable > 0 ? 0 : (int)($stmt['summary']['credit'] ?? 0);
                // Oldest due first — the order a payment settles them (SPEC: "oldest due first in Still owed").
                foreach (array_slice($stmt['open'], 0, 20) as $o) {
                    $open[] = ['what' => function_exists('fees_made_label') ? fees_made_label((string)$o['kind'], (string)$o['note']) : (string)$o['kind'], 'due' => (string)$o['due'], 'left' => (int)$o['left']];
                }
            }
        } catch (Throwable $e) { error_log('[preport] balance ' . $mid . ': ' . $e->getMessage()); }
    }

    // The people around them: mentor, the latest leadership index and the companion's word.
    $mentor = function_exists('results_mentor_of') ? results_mentor_of($mid) : null;
    $sc = db_row("SELECT total, month FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'mentor' AND month <= ? ORDER BY month DESC LIMIT 1", [$mid, substr($to, 0, 7)]);
    $comp = db_row('SELECT rating, summary FROM member_assessments WHERE memberId = ? ORDER BY period DESC LIMIT 1', [$mid]);
    $courses = function_exists('curriculum_member_courses') ? array_values(array_filter(curriculum_member_courses($m), static fn($c) => !function_exists('curriculum_is_everyones') || !curriculum_is_everyones((string)$c))) : [];

    return [
        'v' => 2, 'kind' => $kind, 'label' => $label, 'from' => $from, 'to' => $to, 'asOf' => $asOf,
        'subject' => ['type' => 'member', 'id' => $mid, 'name' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                      'centre' => (string)($m['centre'] ?? ''), 'courses' => $courses, 'mentor' => (string)($mentor['fullName'] ?? ''),
                      'first' => mp_first((string)$m['fullName'])],
        'attendance' => ['days' => count($days), 'present' => $present, 'late' => $late, 'absent' => $absent, 'unexcused' => count(array_intersect($unexcused, $days)),
                         'noSignOut' => $noOut, 'rate' => preport_pct($present, count($days)), 'register' => $register],
        'learning' => ['lessons' => array_map(static fn($l) => ['title' => (string)$l['title'], 'course' => (string)$l['course'], 'pct' => (int)$l['bestPct'], 'date' => substr((string)$l['completedAt'], 0, 10)], $lessons),
                       'exams' => array_map(static fn($x) => ['what' => (string)($x['title'] ?: $x['course']), 'kind' => (string)$x['kind'], 'pct' => (int)$x['pct'], 'band' => (string)$x['band'], 'date' => substr((string)$x['submittedAt'], 0, 10)], $exams),
                       'certificates' => array_map(static function ($c) { $d = safe_json((string)$c['data']) ?: []; return ['no' => (string)$c['docNo'], 'title' => (string)($d['title'] ?? $d['course'] ?? 'Certificate'), 'date' => substr((string)$c['issuedAt'], 0, 10)]; }, $certs),
                       'completed' => (int)($overall['completed'] ?? 0), 'total' => (int)($overall['total'] ?? 0), 'overdue' => (int)($overall['overdue'] ?? 0)],
        'conduct' => array_map(static fn($s) => ['kind' => (string)$s['kind'], 'reason' => (string)$s['reason'], 'amount' => (int)$s['amount'], 'status' => (string)$s['status'], 'date' => substr((string)$s['issuedAt'], 0, 10)], $sanctions),
        'money' => ['charged' => $charged, 'received' => $received, 'fines' => $fines, 'lines' => $lines, 'chargedTotal' => array_sum($charged), 'receivedTotal' => array_sum($received),
                    'payable' => $payable, 'credit' => $credit, 'open' => $open],
        'people' => ['leadership' => $sc ? (int)$sc['total'] : null, 'rating' => (string)($comp['rating'] ?? ''), 'note' => mb_substr((string)($comp['summary'] ?? ''), 0, 600)],
    ];
}

/** A Summer School participant's edition report. */
function preport_participant_data(array $s, array $ed, ?string $asOf = null): array {
    $sid = (string)$s['studentId'];
    $from = substr((string)$ed['startDate'], 0, 10); $to = substr((string)$ed['endDate'], 0, 10);
    $cal = function_exists('participant_calendar_for') ? participant_calendar_for($sid) : ['enabled' => false];
    $days = !empty($cal['enabled']) && function_exists('programme_days_between') ? programme_days_between($from, $to, $cal) : [];
    $scans = [];
    foreach (db_all('SELECT date, status, lateMinutes FROM attendance WHERE studentId = ? AND date BETWEEN ? AND ?', [$sid, $from, $to]) as $r) $scans[(string)$r['date']] = $r;
    if (!$days) $days = array_keys($scans);   // no calendar for this edition: the days they came are the days we know of
    sort($days);
    $present = 0; $late = 0; $register = [];
    foreach ($days as $d) {
        $r = $scans[$d] ?? null;
        if ($r) { $present++; $l = in_array((string)$r['status'], ['late', 'tardy'], true); if ($l) $late++; $register[] = ['date' => $d, 'mark' => $l ? 'Late' : 'Present', 'detail' => ''];
        } else $register[] = ['date' => $d, 'mark' => 'Absent', 'detail' => ''];
    }
    $group = (string)($s['groupId'] ?? '') !== '' ? db_row('SELECT name, code FROM summer_groups WHERE groupId = ? LIMIT 1', [(string)$s['groupId']]) : null;
    $sanctions = db_all("SELECT kind, reason, amount, status, issuedAt FROM sanctions WHERE personId = ? AND substr(issuedAt, 1, 10) BETWEEN ? AND ? ORDER BY issuedAt", [$sid, $from, $to]);
    return [
        'v' => 1, 'kind' => 'edition', 'label' => (string)($ed['name'] ?? ('Summer School ' . substr($from, 0, 4))), 'from' => $from, 'to' => $to, 'asOf' => $asOf ?? attendance_today(),
        'subject' => ['type' => 'participant', 'id' => $sid, 'name' => (string)$s['fullName'], 'displayId' => (string)($s['displayId'] ?? ''),
                      'centre' => (string)($s['centre'] ?? ''), 'courses' => array_values(array_filter([(string)($s['track'] ?? '')])),
                      'group' => $group ? trim((string)$group['name'] . ' ' . ((string)$group['code'] !== '' ? '(' . $group['code'] . ')' : '')) : ''],
        'attendance' => ['days' => count($days), 'present' => $present, 'late' => $late, 'absent' => count($days) - $present, 'unexcused' => 0, 'noSignOut' => 0,
                         'rate' => preport_pct($present, count($days)), 'register' => $register],
        'learning' => null,
        'conduct' => array_map(static fn($x) => ['kind' => (string)$x['kind'], 'reason' => (string)$x['reason'], 'amount' => (int)$x['amount'], 'status' => (string)$x['status'], 'date' => substr((string)$x['issuedAt'], 0, 10)], $sanctions),
        'money' => null, 'people' => null,
    ];
}

/**
 * The summary sentence (SPEC "Summary sentence rules"), as plain text and as HTML with the balance in bold. Built
 * here, server-side, so the email, the page and the PDF printed from it say the same thing. The child is named
 * rather than given a pronoun.
 */
function preport_headline(array $r, bool $html = false): string {
    $first = (string)($r['subject']['first'] ?? '') ?: (mp_first((string)$r['subject']['name']) ?: 'Your child');
    $e = static fn($s) => $html ? esc_html((string)$s) : (string)$s;
    $a = $r['attendance']; $parts = [];
    if ($a['days'] > 0) {
        $parts[] = $e($first . ' attended ' . $a['present'] . ' of ' . $a['days'] . ' programme day' . ($a['days'] === 1 ? '' : 's') . ' (' . (int)$a['rate'] . '%)'
            . ($a['late'] ? ', arriving late ' . ([1 => 'once', 2 => 'twice'][$a['late']] ?? $a['late'] . ' times') : '') . '.');
    } else {
        $parts[] = $e('There were no programme days for ' . $first . ' in this period.');
    }
    if (!empty($r['learning'])) {
        $L = $r['learning']; $n = count($L['lessons']);
        $parts[] = $e($first . ' completed ' . $n . ' lesson' . ($n === 1 ? '' : 's') . ' in the period'
            . ($L['overdue'] ? ', and ' . $L['overdue'] . ' lesson' . ($L['overdue'] === 1 ? ' is' : 's are') . ' overdue' : '') . '.');
    }
    if (!empty($r['money'])) {
        $M = $r['money'];
        if ($M['payable'] > 0) {
            $amt = preport_money((int)$M['payable']);
            $parts[] = $e('The balance to pay on ' . preport_date($r['asOf']) . ' is ') . ($html ? '<strong>' . esc_html($amt) . '</strong>' : $amt) . '.';
        } else {
            $parts[] = $e('There is nothing to pay.');
        }
    }
    return implode(' ', $parts);
}

/* ── The document (handoff: ngg-progress-report-handoff/SPEC.md; styles in assets/report/report.css) ── */

/** A status tag — one component, four variants (SPEC: "Status tag is one partial"). */
function preport_tag(string $variant, string $label): string {
    $v = in_array($variant, ['ok', 'warn', 'bad', 'neutral'], true) ? $variant : 'neutral';
    return '<span class="rp-tag is-' . $v . '">' . esc_html($label) . '</span>';
}
/** A conduct record's status as a tag: Active = warn, Resolved = ok, Waived = neutral. */
function preport_conduct_tag(string $status): string {
    $s = mb_strtolower(trim($status));
    if (in_array($s, ['active', 'pending', 'open', 'issued'], true)) return preport_tag('warn', ucfirst($s === 'issued' ? 'active' : $s));
    if (in_array($s, ['waived', 'voided', 'void', 'cancelled'], true)) return preport_tag('neutral', 'Waived');
    return preport_tag('ok', 'Resolved');
}
/**
 * The shared table (SPEC: "one table partial — header row, rows, empty message, optional total row").
 * $cols: [label, class, width%]; $rows: lists of cell HTML (already escaped); $tail: a final row's HTML.
 */
function preport_table(array $cols, array $rows, string $empty = '', string $tail = '', string $caption = '', bool $totals = false): string {
    if (!$rows && $tail === '') return $empty !== '' ? '<p class="rp-empty">' . esc_html($empty) . '</p>' : '';
    $h = '<table class="rp-t' . ($totals ? ' is-totals' : '') . '">' . ($caption !== '' ? '<caption class="rp-sr">' . esc_html($caption) . '</caption>' : '') . '<thead><tr>';
    foreach ($cols as $c) $h .= '<th scope="col"' . (!empty($c[1]) ? ' class="' . $c[1] . '"' : '') . (!empty($c[2]) ? ' style="width:' . (int)$c[2] . '%"' : '') . '>' . esc_html($c[0]) . '</th>';
    $h .= '</tr></thead><tbody>';
    foreach ($rows as $row) {
        $h .= '<tr>';
        foreach (array_values($row) as $i => $cell) {
            [$html, $cls] = is_array($cell) ? $cell : [$cell, ''];
            $cls = trim(($cols[$i][1] ?? '') . ' ' . $cls);
            $h .= '<td' . ($cls !== '' ? ' class="' . $cls . '"' : '') . '>' . $html . '</td>';
        }
        $h .= '</tr>';
    }
    return $h . $tail . '</tbody></table>';
}

/**
 * The report. `$page` gives the whole printable document (with the "Print or save as PDF" button); without it,
 * the inner sheet. Reads a sealed report of either data version: v2 carries the per-line ledger and the tag
 * of every register day; a v1 report (issued before the redesign) is drawn from its totals.
 */
function preport_html(array $r, bool $page = false, string $reportNo = ''): string {
    $e = static fn($s) => esc_html((string)$s);
    $S = $r['subject']; $A = $r['attendance'];
    $kind = (string)($r['kind'] ?? 'month');
    $title = ['month' => 'Monthly Progress Report', 'session' => 'End of Session Report', 'edition' => 'Summer School Report'][$kind] ?? 'Progress Report';
    $who = ($S['type'] ?? 'member') === 'participant' ? 'Participant' : 'Student';
    $badge = $kind === 'month' ? gmdate('F Y', strtotime(($r['from'] ?? '') . ' 12:00:00 UTC') ?: time()) : (string)$r['label'];
    $dash = '<span class="is-dim">—</span>';

    // Letterhead and title
    $o = '<header><div class="rp-head"><div class="rp-brand"><img class="rp-logo" src="/assets/report/logo.png" alt="" width="48" height="48"><div class="rp-brand-t">'
       . '<span class="rp-brand-n">Next Generation Genius</span><span class="rp-over">An Afrovanguard programme</span></div></div>'
       . '<table class="rp-meta"><tbody>' . ($reportNo !== '' ? '<tr><th scope="row">Report no.</th><td>' . $e($reportNo) . '</td></tr>' : '')
       . '<tr><th scope="row">Issued</th><td>' . $e(preport_date((string)$r['asOf'])) . '</td></tr></tbody></table></div><div class="rp-bar"></div></header>';
    $o .= '<div class="rp-title"><div class="rp-title-t"><h1>' . $e($title) . '</h1><p class="rp-sub">Reporting period: ' . $e(preport_span((string)$r['from'], (string)$r['to'])) . '</p></div>'
        . '<span class="rp-badge">' . $e($badge) . '</span></div>';

    // Details (key/value; th scope="row" for labels)
    $kv = [[$who, $S['name'], 'is-name'], ['ID number', ($S['displayId'] ?? '') ?: '—', ''], ['Centre', ($S['centre'] ?? '') ?: '—', '']];
    if (!empty($S['group'])) $kv[] = ['Group', $S['group'], ''];
    $kv[] = ['Courses', !empty($S['courses']) ? implode(', ', $S['courses']) : '—', ''];
    if (($S['type'] ?? 'member') !== 'participant') $kv[] = ['Mentor', ($S['mentor'] ?? '') ?: '—', ''];
    $kv[] = ['Period', preport_date((string)$r['from']) . ' – ' . preport_date((string)$r['to']), ''];
    $o .= '<table class="rp-kv"><tbody>';
    foreach (array_chunk($kv, 2) as $pair) {
        $o .= '<tr>';
        foreach ($pair as [$k, $v, $cls]) $o .= '<th scope="row">' . $e($k) . '</th><td' . ($cls ? ' class="' . $cls . '"' : '') . '>' . $e($v) . '</td>';
        if (count($pair) === 1) $o .= '<th scope="row"></th><td></td>';
        $o .= '</tr>';
    }
    $o .= '</tbody></table>';

    // Summary: the sentence, then the four figures
    $L = $r['learning'] ?? null; $M = $r['money'] ?? null;
    $lastExam = $L && !empty($L['exams']) ? $L['exams'][count($L['exams']) - 1] : null;
    $fig = static fn($label, $value, $cap, $cls = '') => '<div class="rp-fig' . ($cls ? ' ' . $cls : '') . '"><span class="rp-over">' . esc_html($label) . '</span><span class="rp-fig-v">' . esc_html($value) . '</span><span class="rp-fig-c">' . esc_html($cap) . '</span></div>';
    $figs = $fig('Attendance', $A['rate'] === null ? '—' : $A['rate'] . '%', $A['present'] . ' of ' . $A['days'] . ' day' . ($A['days'] === 1 ? '' : 's'));
    if ($L) {
        $figs .= $fig('Lessons', $L['completed'] . ' / ' . $L['total'], $L['overdue'] ? $L['overdue'] . ' overdue' : 'None overdue');
        $figs .= $fig('Exam score', $lastExam ? $lastExam['pct'] . '%' : '—', $lastExam ? (($lastExam['band'] ?? '') ?: 'Marked') : 'No exam this period');
    } else {
        $figs .= $fig('Late', (string)$A['late'], $A['late'] ? 'arrivals after the start' : 'Always on time');
        $figs .= $fig('Absent', (string)$A['absent'], $A['absent'] === 1 ? 'day' : 'days');
    }
    if ($M) {
        $credit = (int)($M['credit'] ?? 0);
        $figs .= $M['payable'] > 0 ? $fig('Balance due', preport_money((int)$M['payable']), 'By ' . preport_date((string)$r['asOf']), 'is-money')
               : $fig($credit > 0 ? 'Credit' : 'Balance due', preport_money($credit), $credit > 0 ? 'On account' : 'All paid', 'is-money');
    } else {
        $figs .= $fig('Conduct', (string)count($r['conduct'] ?? []), count($r['conduct'] ?? []) === 1 ? 'record' : 'records');
    }
    $o .= '<section class="rp-sec is-summary" aria-labelledby="rp-s0"><h2 id="rp-s0">Summary</h2><p class="rp-lead">' . preport_headline($r, true) . '</p><div class="rp-figs">' . $figs . '</div></section>';

    // 1. Attendance
    $n = 1;
    $sec = static function (int $n, string $id, string $title, string $body): string {
        return '<section class="rp-sec" aria-labelledby="rp-' . $id . '"><h2 id="rp-' . $id . '">' . $n . '. ' . esc_html($title) . '</h2>' . $body . '</section>';
    };
    $att = preport_table([['Programme days', ''], ['Present', 'is-num'], ['Late', 'is-num'], ['Absent', 'is-num'], ['Unexcused', 'is-num'], ['Rate', 'is-num is-strong']],
        [[(string)$A['days'], (string)$A['present'], (string)$A['late'], (string)$A['absent'], (string)$A['unexcused'], $A['rate'] === null ? '—' : $A['rate'] . '%']], '', '', 'Attendance totals', true);
    $log = [];
    foreach ($A['register'] as $d) {
        $tag = $d['tag'] ?? (str_starts_with((string)$d['mark'], 'Absent') ? 'bad' : ((string)$d['mark'] === 'Late' ? 'warn' : 'ok'));
        $note = (string)($d['detail'] ?? '');
        if ($note !== '' && preg_match('/^\d+ min$/', $note)) $note = 'Arrived ' . $note . ' late';   // a v1 report's note
        $log[] = [$e(preport_day((string)$d['date'])), preport_tag($tag, (string)$d['mark']), $note !== '' ? $e(ucfirst($note)) : $dash];
    }
    $att .= preport_table([['Date', '', 30], ['Status', '', 40], ['Note', '']], $log, 'No programme days in this period.', '', 'Attendance by day');
    $o .= $sec($n++, 'att', 'Attendance', $att);

    // 2. Learning (members)
    if ($L) {
        $lb = preport_table([['Lessons completed this period', ''], ['All lessons to date', 'is-num'], ['Overdue', 'is-num']],
            [[(string)count($L['lessons']), $L['completed'] . ' of ' . $L['total'], [(string)$L['overdue'], $L['overdue'] ? 'is-bad' : '']]], '', '', 'Learning totals', true);
        $lb .= preport_table([['Lesson', ''], ['Course', '', 30], ['Score', 'is-num is-mid', 14]],
            array_map(static fn($x) => [esc_html($x['title']), esc_html($x['course']), (int)$x['pct'] . '%'], $L['lessons']), 'No lessons completed this period.', '', 'Lessons completed');
        $lb .= preport_table([['Exam', ''], ['Date', '', 22], ['Score', 'is-num is-mid', 12], ['Band', 'is-num is-band', 14]],
            array_map(static fn($x) => [esc_html($x['what']), esc_html(preport_date($x['date'])), (int)$x['pct'] . '%', esc_html(($x['band'] ?? '') ?: '—')], $L['exams']), 'No exams this period.', '', 'Exams');
        if (!empty($L['certificates'])) $lb .= preport_table([['Certificate', ''], ['Number', '', 26], ['Issued', '', 22]],
            array_map(static fn($x) => [esc_html($x['title']), esc_html($x['no']), esc_html(preport_date($x['date']))], $L['certificates']), '', '', 'Certificates');
        $o .= $sec($n++, 'learn', 'Learning', $lb);
    }

    // 3. Conduct
    $cond = array_map(static fn($x) => [esc_html(preport_date($x['date'])), esc_html(ucfirst(str_replace('_', ' ', (string)$x['kind'])) . ($x['amount'] ? ' (' . preport_money((int)$x['amount']) . ')' : '')),
        $x['reason'] !== '' ? esc_html($x['reason']) : '<span class="is-dim">—</span>', preport_conduct_tag((string)$x['status'])], $r['conduct'] ?? []);
    $o .= $sec($n++, 'cond', 'Conduct', preport_table([['Date', '', 22], ['Record', '', 26], ['Reason', ''], ['Status', 'is-num', 14]], $cond, 'No conduct records this period.', '', 'Conduct records'));

    // 4. Fees, dues and fines (members)
    if ($M) {
        $lines = $M['lines'] ?? null;
        if ($lines === null) {   // a v1 report: totals by kind
            $lbl = ['membership' => 'membership fee', 'dues' => 'monthly dues', 'fine' => 'fines', 'adjustment' => 'adjustments'];
            $lines = [];
            foreach ($M['charged'] as $k => $v) $lines[] = ['what' => 'Charged: ' . ($lbl[$k] ?? $k), 'date' => '', 'amount' => (int)$v, 'credit' => false];
            foreach ($M['received'] as $k => $v) $lines[] = ['what' => $k === 'payment' ? 'Payments received' : ucfirst($k), 'date' => '', 'amount' => (int)$v, 'credit' => true];
        }
        $fb = preport_table([['This period', ''], ['Date', '', 22], ['Amount', 'is-num', 18]],
            array_map(static fn($x) => [esc_html($x['what']), $x['date'] !== '' ? esc_html(preport_date($x['date'])) : '', ($x['credit'] ? '− ' : '') . esc_html(preport_money((int)$x['amount']))], $lines),
            'Nothing was charged or paid in this period.', '', 'Charges and payments this period');
        $credit = (int)($M['credit'] ?? 0);
        $balLabel = $M['payable'] > 0 ? 'Balance to pay on ' . preport_date((string)$r['asOf']) : ($credit > 0 ? 'Credit on account' : 'Nothing to pay');
        $tail = '<tr class="rp-bal"><td class="rp-bal-l">' . $e($balLabel) . '</td><td></td><td class="rp-bal-v' . ($credit > 0 && $M['payable'] <= 0 ? ' is-credit' : '') . '">'
              . $e(preport_money($M['payable'] > 0 ? (int)$M['payable'] : $credit)) . '</td></tr>';
        $fb .= preport_table([['Still owed', ''], ['Due', '', 22], ['Amount', 'is-num', 18]],
            array_map(static fn($x) => [esc_html($x['what']), $x['due'] !== '' ? esc_html(preport_date($x['due'])) : '—', esc_html(preport_money((int)$x['left']))], $M['open'] ?? []),
            '', $tail, 'What is still owed, and the balance');
        if ($M['payable'] > 0) $fb .= '<p class="rp-note">Pay in the family account (Fees) or at the centre desk. If you have already paid, send the receipt from Fees and it will be matched.</p>';
        $o .= $sec($n++, 'fees', 'Fees, dues and fines', $fb);
    }

    // 5. Mentor comments (members)
    if (($S['type'] ?? 'member') !== 'participant') {
        $P = $r['people'] ?? ['leadership' => null, 'note' => ''];
        $comment = trim((string)($P['note'] ?? ''));
        $mb = '<div class="rp-mentor"><div class="rp-mentor-l"><span class="rp-over">Leadership Index</span><span class="rp-mentor-v">' . ($P['leadership'] !== null ? (int)$P['leadership'] . ' / 100' : '—') . '</span></div>'
            . '<div class="rp-mentor-r"><p class="rp-lead">' . $e($comment !== '' ? mb_substr($comment, 0, 400) : 'Mentor comments will appear in next month\'s report.') . '</p>'
            . ($comment !== '' && ($S['mentor'] ?? '') !== '' ? '<span class="rp-mentor-by">— ' . $e($S['mentor']) . ', Mentor</span>' : '') . '</div></div>';
        $o .= $sec($n++, 'mentor', 'Mentor comments', $mb);
    }

    // 6. Acknowledgement
    $first = (string)($S['first'] ?? '') ?: (mp_first((string)$S['name']) ?: 'your child');
    $ack = '<p class="rp-note">' . (($S['type'] ?? 'member') === 'participant'
            ? 'Questions about anything in this report: reply to the email it came with, or speak to the centre.'
            : 'Please sign this report in the family account so ' . $e($first) . '’s mentor knows home has read it. Questions about anything in it: reply to the email it came with, or speak to the centre.') . '</p>'
         . '<div class="rp-sign"><div><b>For NGG — Programme Coordinator</b><span>Signature and date</span></div><div><b>Parent / guardian</b><span>Signature and date</span></div></div>';
    $o .= $sec($n, 'ack', 'Acknowledgement', $ack);

    $o .= '<footer class="rp-foot"><span>Produced from NGG’s attendance, learning, conduct and accounts records as they stood on ' . $e(preport_date((string)$r['asOf'])) . '. Kept on file as issued.</span>'
        . ($reportNo !== '' ? '<span>' . $e($reportNo) . '</span>' : '') . '</footer>';

    $sheet = '<div class="rp-page rp">' . $o . '</div>';
    if (!$page) return $sheet;
    return preport_document($title . ' — ' . $S['name'] . ' — ' . $badge, $sheet);
}

/** The printable page around a sheet: the stylesheet, the print button (external script), A4. */
function preport_document(string $title, string $sheet): string {
    $v = '?v=3';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . esc_html($title) . '</title>'
         . '<link rel="stylesheet" href="/assets/report/report.css' . $v . '"><script src="/assets/report/report.js' . $v . '" defer></script></head>'
         . '<body class="rp-body"><button class="rp-print" type="button" data-print>Print or save as PDF</button>' . $sheet . '</body></html>';
}

/**
 * The email that carries the report. Mail clients cannot load the report's fonts or layout, so it carries the
 * summary — the sentence and the four figures, in the report's colours, inline — and the button to the full
 * printable report. Out of scope of the handoff ("the email template that carries the report"), kept in its look.
 */
function preport_email_body(array $r): string {
    $A = $r['attendance']; $L = $r['learning'] ?? null; $M = $r['money'] ?? null;
    $cell = static fn($label, $value, $cap, $money = false) => '<td style="padding:12px 14px;border:1px solid #D1D5DB;background:' . ($money ? '#FEF4DC' : '#FFFFFF') . ';vertical-align:top">'
        . '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:600;color:' . ($money ? '#7A5600' : '#4B5563') . '">' . esc_html($label) . '</div>'
        . '<div style="font-size:22px;font-weight:700;color:' . ($money ? '#111827' : '#1C2A5E') . ';margin:2px 0">' . esc_html($value) . '</div>'
        . '<div style="font-size:12px;color:' . ($money ? '#7A5600' : '#4B5563') . '">' . esc_html($cap) . '</div></td>';
    $row = $cell('Attendance', $A['rate'] === null ? '—' : $A['rate'] . '%', $A['present'] . ' of ' . $A['days'] . ' days');
    if ($L) $row .= $cell('Lessons', $L['completed'] . ' / ' . $L['total'], $L['overdue'] ? $L['overdue'] . ' overdue' : 'None overdue');
    if ($M) $row .= $M['payable'] > 0 ? $cell('Balance due', preport_money((int)$M['payable']), 'By ' . preport_date((string)$r['asOf']), true)
                                      : $cell('Balance due', preport_money(0), 'All paid', true);
    return '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#111827">' . preport_headline($r, true) . '</p>'
         . '<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 6px"><tr>' . $row . '</tr></table>'
         . '<p style="margin:10px 0 0;font-size:13px;color:#374151">The full report — attendance day by day, lessons and exams, conduct, every charge and payment, and your mentor\'s comments — opens from the button below, ready to print or save as a PDF.</p>';
}

/* ── Issuing and sending ──────────────────────────────────────────────── */

/** Seal a report (once per subject, kind and period). Returns the stored row — the existing one if already issued. */
function preport_issue(string $subjectId, string $type, string $kind, string $period, array $data): array {
    $have = db_row('SELECT * FROM parent_reports WHERE subjectId = ? AND kind = ? AND period = ? LIMIT 1', [$subjectId, $kind, $period]);
    if ($have) return $have;
    $row = ['reportId' => 'RPT-' . strtoupper(rand_hex(6)), 'subjectId' => $subjectId, 'subjectType' => $type, 'kind' => $kind, 'period' => $period,
            'periodFrom' => (string)$data['from'], 'periodTo' => (string)$data['to'], 'data' => json_encode($data, JSON_UNESCAPED_UNICODE), 'issuedAt' => now_iso()];
    try { db_insert('parent_reports', $row); } catch (Throwable $e) { /* a tick beside this one sealed it first */ }
    return db_row('SELECT * FROM parent_reports WHERE subjectId = ? AND kind = ? AND period = ? LIMIT 1', [$subjectId, $kind, $period]) ?: $row;
}

/**
 * A Summer School parent has no family account to sign in with, so their report's link carries its own key: an
 * HMAC of the report number under the deployment's secret — stateless like the session cookies, nothing stored,
 * and unguessable for any other report.
 */
function preport_sig(string $reportId): string {
    $secret = (string)($GLOBALS['CONFIG']['cookie_secret'] ?? '');
    return $secret === '' ? '' : substr(hash_hmac('sha256', 'parent-report:' . $reportId, $secret), 0, 32);
}
function preport_public_url(string $reportId): string {
    return (function_exists('family_origin') ? family_origin() : '') . '/api/public/report.php?id=' . rawurlencode($reportId) . '&k=' . preport_sig($reportId);
}
/** public.report — a sealed participant report, for whoever holds its signed link. */
function public_report_get(array $p): array {
    $id = (string)($p['reportId'] ?? ''); $k = (string)($p['key'] ?? '');
    $sig = preport_sig($id);
    if ($id === '' || $sig === '' || !hash_equals($sig, $k)) return ['ok' => false, 'error' => 'not_found'];
    $rep = db_row("SELECT * FROM parent_reports WHERE reportId = ? AND subjectType = 'participant' LIMIT 1", [$id]);
    if (!$rep) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'html' => preport_html(safe_json((string)$rep['data']) ?: [], true, (string)$rep['reportId'])];
}

function preport_view_url(string $reportId): string {
    return (function_exists('family_origin') ? family_origin() : '') . '/api/family/report.php?id=' . rawurlencode($reportId);
}

/** Send one sealed member report to every guardian who follows them: mail + a signable inbox notice. */
function preport_send_member(array $rep, array $m): int {
    $data = safe_json((string)$rep['data']) ?: [];
    if (!$data) return 0;
    $first = mp_first((string)$m['fullName']) ?: 'Your child';
    $title = ['month' => 'Monthly Progress Report', 'session' => 'End of Session Report'][$rep['kind']] ?? 'Progress Report';
    $sent = 0;
    foreach (db_all("SELECT g.guardianId, g.email, g.status FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                     WHERE w.memberId = ? AND w.status = 'active'", [(string)$m['memberId']]) as $g) {
        if ((string)$g['status'] !== 'active') continue;
        if (!preport_claim('report:' . $rep['kind'], (string)$rep['reportId'], (string)$g['guardianId'])) continue;
        $refId = 'report:' . ($rep['kind'] === 'month' ? '' : $rep['kind'] . ':') . $rep['period'] . ':' . (string)$m['memberId'];
        if (function_exists('family_notice_add') && family_notice_add((string)$g['guardianId'], 'report', $refId, $first . '’s ' . $data['label'] . ' report',
                preport_headline($data) . "\n\nOpen the full report: " . preport_view_url((string)$rep['reportId']) . "\n\nSign it so " . $first . '’s mentor knows home has seen it.', 'NGG')) {
            db_exec("UPDATE guardian_notices SET cat = 'report', memberId = ?, sign = 1 WHERE guardianId = ? AND kind = 'report' AND refId = ?", [(string)$m['memberId'], (string)$g['guardianId'], $refId]);
        }
        if (function_exists('family_mail') && trim((string)$g['email']) !== '') {
            family_mail((string)$g['email'], $first . '’s ' . $title . ' — ' . $data['label'], [
                'title' => $title, 'intro' => (string)$m['fullName'] . ' · ' . $data['label'], 'preheader' => preport_headline($data),
                'bodyHtml' => preport_email_body($data),
                'ctaLabel' => 'Open, print or sign the report →', 'ctaUrl' => preport_view_url((string)$rep['reportId']),
                'footNote' => 'Family reports are part of membership. Reply to this email with any question about it.',
            ]);
        }
        $sent++;
    }
    return $sent;
}

/** The members whose families get reports: active NGG members with at least one active guardian link. */
function preport_member_batch(string $kind, string $period, int $limit): array {
    return db_all("SELECT DISTINCT m.* FROM members m JOIN guardian_wards w ON w.memberId = m.memberId AND w.status = 'active'
                   WHERE m.status = 'active' AND COALESCE(m.type, 'NGG') <> 'Summer'
                   AND NOT EXISTS (SELECT 1 FROM parent_reports r WHERE r.subjectId = m.memberId AND r.kind = ? AND r.period = ?)
                   ORDER BY m.id LIMIT " . max(1, $limit), [$kind, $period]);
}

/** The monthly reports: on days 1–5 of a month, for the month before. */
function preport_monthly_run(?string $today = null, int $limit = PREPORT_BATCH): array {
    $today = $today ?: attendance_today();
    if ((int)substr($today, 8, 2) > 5) return ['ok' => true, 'made' => 0, 'skipped' => 'not_the_start_of_a_month'];
    [$period, $from, $to, $label] = preport_last_month($today);
    $made = 0; $sent = 0;
    foreach (preport_member_batch('month', $period, $limit) as $m) {
        $rep = preport_issue((string)$m['memberId'], 'member', 'month', $period, preport_member_data($m, $from, $to, 'month', $label, $today));
        $made++;
        $sent += preport_send_member($rep, $m);
    }
    return ['ok' => true, 'made' => $made, 'sent' => $sent, 'period' => $period];
}

/** End-of-session reports: for each session that ended in the last PREPORT_SESSION_GRACE_DAYS days. */
function preport_session_run(?string $today = null, int $limit = PREPORT_BATCH): array {
    $today = $today ?: attendance_today();
    $since = gmdate('Y-m-d', strtotime($today . ' 12:00:00 UTC') - PREPORT_SESSION_GRACE_DAYS * 86400);
    $made = 0; $sent = 0;
    foreach (db_all("SELECT * FROM sessions WHERE substr(endDate, 1, 10) >= ? AND substr(endDate, 1, 10) < ? ORDER BY endDate", [$since, $today]) as $s) {
        if (strtoupper((string)($s['code'] ?? '')) === 'SUMMER') continue;   // Summer School's season reports per edition
        $from = substr((string)$s['startDate'], 0, 10); $to = substr((string)$s['endDate'], 0, 10);
        $period = (string)$s['sessionId'];
        $label = trim((string)($s['name'] ?? '')) ?: ('Session ' . $from . ' – ' . $to);
        foreach (preport_member_batch('session', $period, $limit - $made) as $m) {
            $rep = preport_issue((string)$m['memberId'], 'member', 'session', $period, preport_member_data($m, $from, $to, 'session', $label, $today));
            $made++;
            $sent += preport_send_member($rep, $m);
            if ($made >= $limit) break 2;
        }
    }
    return ['ok' => true, 'made' => $made, 'sent' => $sent];
}

/** Summer School: each participant's edition report, to the parent's email, after the season ends. */
function preport_edition_run(?string $today = null, int $limit = PREPORT_BATCH): array {
    $today = $today ?: attendance_today();
    $since = gmdate('Y-m-d', strtotime($today . ' 12:00:00 UTC') - PREPORT_SESSION_GRACE_DAYS * 86400);
    $made = 0; $sent = 0;
    foreach (db_all("SELECT * FROM summer_cohorts WHERE COALESCE(endDate,'') <> '' AND substr(endDate, 1, 10) >= ? AND substr(endDate, 1, 10) < ?", [$since, $today]) as $ed) {
        $rows = db_all("SELECT * FROM summer_students s WHERE s.cohortId = ? AND COALESCE(s.status,'active') = 'active' AND COALESCE(s.parentEmail,'') <> ''
                        AND NOT EXISTS (SELECT 1 FROM parent_reports r WHERE r.subjectId = s.studentId AND r.kind = 'edition' AND r.period = ?)
                        ORDER BY s.id LIMIT " . max(1, $limit - $made), [(string)$ed['cohortId'], (string)$ed['cohortId']]);
        foreach ($rows as $s) {
            $data = preport_participant_data($s, $ed, $today);
            $rep = preport_issue((string)$s['studentId'], 'participant', 'edition', (string)$ed['cohortId'], $data);
            $made++;
            if (preport_claim('report:edition', (string)$rep['reportId'], (string)$s['parentEmail']) && function_exists('send_mail') && function_exists('email_template')) {
                @send_mail((string)$s['parentEmail'], (mp_first((string)$s['fullName']) ?: 'Your child') . '’s Summer School report — ' . $data['label'], email_template([
                    'eyebrow' => 'NGG · Summer School', 'title' => 'Summer School Report', 'intro' => (string)$s['fullName'] . ' · ' . $data['label'],
                    'preheader' => preport_headline($data), 'bodyHtml' => preport_email_body($data),
                    'ctaLabel' => 'Open, print or save the report →', 'ctaUrl' => preport_public_url((string)$rep['reportId']),
                    'footNote' => 'Reply to this email with any question about this report.',
                ]));
                $sent++;
            }
            if ($made >= $limit) break 2;
        }
    }
    return ['ok' => true, 'made' => $made, 'sent' => $sent];
}

/** Everything, from the cron tick. Each part bounded and idempotent. */
function preport_run(?string $today = null): array {
    return ['month' => preport_monthly_run($today), 'session' => preport_session_run($today), 'edition' => preport_edition_run($today),
            'daily' => attendance_daily_run($today)];
}

/* ── Reading a report ─────────────────────────────────────────────────── */

/** family.report — a guardian opens a sealed report about a child they follow. */
function family_report_get(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $rep = db_row('SELECT * FROM parent_reports WHERE reportId = ? LIMIT 1', [(string)($p['reportId'] ?? '')]);
    if (!$rep || $gid === '' || (string)$rep['subjectType'] !== 'member') return ['ok' => false, 'error' => 'not_found'];
    if (!db_row("SELECT 1 FROM guardian_wards WHERE guardianId = ? AND memberId = ? AND status = 'active' LIMIT 1", [$gid, (string)$rep['subjectId']])) return ['ok' => false, 'error' => 'not_found'];
    $data = safe_json((string)$rep['data']) ?: [];
    return ['ok' => true, 'reportId' => (string)$rep['reportId'], 'html' => preport_html($data, true, (string)$rep['reportId'])];
}

/** admin.reports.member — staff preview a member's report for a month (YYYY-MM) or a session, built now, not sent. */
function admin_reports_member(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (empty($g['ok'])) return $g;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    $month = (string)($p['month'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) $month = substr(preport_last_month(attendance_today())[1], 0, 7);
    $from = $month . '-01'; $to = gmdate('Y-m-t', strtotime($from . ' 12:00:00 UTC'));
    $data = preport_member_data($m, $from, $to, 'month', gmdate('F Y', strtotime($from . ' 12:00:00 UTC')));
    $issued = db_all('SELECT reportId, kind, period, issuedAt FROM parent_reports WHERE subjectId = ? ORDER BY issuedAt DESC LIMIT 24', [(string)$m['memberId']]);
    return ['ok' => true, 'html' => preport_html($data, false), 'data' => $data, 'issued' => $issued];
}

/* ── The daily attendance mail to staff ───────────────────────────────── */

/** One programme's day at one centre: expected, present, late, absent (named), no sign-out. */
function attendance_day_centre(string $programme, string $centre, string $date): array {
    if ($programme === 'club') {
        $people = db_all("SELECT memberId id, fullName, centre FROM members WHERE status = 'active' AND COALESCE(type,'NGG') <> 'Summer' AND COALESCE(role,'member') = 'member' AND centre = ? ORDER BY fullName", [$centre]);
        $people = array_values(array_filter($people, static function ($m) use ($date) {
            return !function_exists('policy_is_day_for') || policy_is_day_for((string)$m['id'], $date, 'member');
        }));
    } else {
        $ed = db_row("SELECT cohortId FROM summer_cohorts WHERE status = 'active' ORDER BY id DESC LIMIT 1");
        $people = $ed ? db_all("SELECT studentId id, fullName, centre FROM summer_students WHERE cohortId = ? AND COALESCE(status,'active') = 'active' AND centre = ? ORDER BY fullName", [(string)$ed['cohortId'], $centre]) : [];
    }
    $ids = array_column($people, 'id');
    $scan = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT studentId, status, checkOutAt, lateMinutes FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$date], $ids)) as $r) $scan[(string)$r['studentId']] = $r;
    }
    $absent = []; $late = []; $noOut = []; $present = 0;
    foreach ($people as $p) {
        $r = $scan[(string)$p['id']] ?? null;
        if (!$r) { $absent[] = (string)$p['fullName']; continue; }
        $present++;
        if (in_array((string)$r['status'], ['late', 'tardy'], true)) $late[] = (string)$p['fullName'] . ((int)$r['lateMinutes'] > 0 ? ' (' . (int)$r['lateMinutes'] . ' min)' : '');
        if (trim((string)($r['checkOutAt'] ?? '')) === '') $noOut[] = (string)$p['fullName'];
    }
    return ['centre' => $centre, 'expected' => count($people), 'present' => $present, 'late' => $late, 'absent' => $absent, 'noSignOut' => $noOut];
}

function attendance_day_html(string $programmeLabel, string $date, array $centres): string {
    $ink = '#16233f'; $soft = '#3d4560'; $line = '#d5dae6';
    $h = '';
    foreach ($centres as $c) {
        $rate = $c['expected'] ? (int)round(100 * $c['present'] / $c['expected']) : 0;
        $h .= "<h3 style=\"font:800 15px Arial;color:$ink;margin:18px 0 6px\">" . esc_html($c['centre']) . " — {$c['present']} of {$c['expected']} ({$rate}%)</h3>";
        $rows = [['Late', $c['late']], ['Absent', $c['absent']], ['Did not sign out', $c['noSignOut']]];
        $h .= "<table style=\"width:100%;border-collapse:collapse\">";
        foreach ($rows as [$k, $list]) {
            $h .= "<tr><th scope=\"row\" style=\"text-align:left;vertical-align:top;padding:6px 10px 6px 0;border-bottom:1px solid $line;font-size:13px;color:$soft;white-space:nowrap\">" . $k . ' (' . count($list) . ")</th>"
                . "<td style=\"padding:6px 0;border-bottom:1px solid $line;font-size:13.5px;color:$ink\">" . ($list ? esc_html(implode(', ', array_slice($list, 0, 60))) . (count($list) > 60 ? ' and ' . (count($list) - 60) . ' more' : '') : '—') . '</td></tr>';
        }
        $h .= '</table>';
    }
    return "<div style=\"font-family:Arial,Helvetica,sans-serif\"><p style=\"margin:0 0 4px;font-size:14px;color:$ink\">" . esc_html($programmeLabel) . ' · ' . esc_html(preport_date($date)) . '</p>' . $h . '</div>';
}

/**
 * The day's attendance, per programme, to the staff who run it — once, after the session. Only on a programme
 * day for that programme, only for centres that had anybody expected, and only the centres in each recipient's
 * scope. Set 'reports_attendance_daily' to '0' to stop it.
 */
function attendance_daily_run(?string $today = null, ?int $nowHourLagos = null): array {
    if (function_exists('setting_raw') && (string)setting_raw('reports_attendance_daily') === '0') return ['ok' => true, 'sent' => 0, 'skipped' => 'off'];
    $today = $today ?: attendance_today();
    $hour = $nowHourLagos ?? (int)gmdate('G', time() + 3600);
    if ($hour < PREPORT_DAILY_HOUR) return ['ok' => true, 'sent' => 0, 'skipped' => 'before_the_end_of_the_day'];
    $sent = 0; $out = [];
    $programmes = [['club', 'NGG Club', 'checkin', 'member'], ['summer', 'Summer School', 'summer', 'student']];
    foreach ($programmes as [$key, $label, $cap, $type]) {
        if (function_exists('policy_is_day') && !policy_is_day($today, $type)) continue;
        $centres = [];
        $names = $key === 'club' ? array_column(db_all("SELECT DISTINCT centre FROM members WHERE status = 'active' AND COALESCE(centre,'') <> '' ORDER BY centre"), 'centre')
                                 : array_column(db_all("SELECT DISTINCT s.centre FROM summer_students s JOIN summer_cohorts c ON c.cohortId = s.cohortId AND c.status = 'active' WHERE COALESCE(s.centre,'') <> '' ORDER BY s.centre"), 'centre');
        foreach ($names as $c) { $d = attendance_day_centre($key, (string)$c, $today); if ($d['expected'] > 0) $centres[(string)$c] = $d; }
        if (!$centres) continue;
        $out[$key] = array_map(static fn($c) => ['expected' => $c['expected'], 'present' => $c['present']], $centres);
        foreach (function_exists('staff_with_cap') ? staff_with_cap($cap) : [] as $st) {
            $email = trim((string)($st['email'] ?? ''));
            if ($email === '') continue;
            $scope = admin_centre_names_in_scope($st);
            $mine = $scope === null ? $centres : array_intersect_key($centres, array_flip($scope));
            if (!$mine) continue;
            if (!preport_claim('att-daily:' . $key, $today, $email)) continue;
            $tot = array_sum(array_column($mine, 'present')); $exp = array_sum(array_column($mine, 'expected'));
            if (function_exists('send_mail') && function_exists('email_template')) {
                @send_mail($email, $label . ' attendance — ' . preport_date($today) . ": $tot of $exp", email_template([
                    'eyebrow' => 'NGG · Daily attendance', 'title' => $label . ': ' . $tot . ' of ' . $exp . ' today',
                    'intro' => 'The register for ' . preport_date($today) . ', centre by centre, as it stood when this was sent.',
                    'bodyHtml' => attendance_day_html($label, $today, array_values($mine)),
                    'ctaLabel' => 'Open the Control Room →', 'ctaUrl' => (function_exists('family_origin') ? family_origin() : '') . '/nextadmin',
                    'footNote' => 'Sent to staff who hold this programme’s attendance. A late correction at the desk shows in the Control Room, not here.',
                ]));
            }
            $sent++;
        }
    }
    return ['ok' => true, 'sent' => $sent, 'programmes' => $out];
}
