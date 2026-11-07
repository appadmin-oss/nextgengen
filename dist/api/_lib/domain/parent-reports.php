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

function preport_money(int $n): string { return function_exists('fees_money_text') ? fees_money_text($n) : '₦' . number_format($n); }
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
            $register[] = ['date' => $d, 'mark' => $isLate ? 'Late' : 'Present', 'detail' => $isLate && (int)$s['lateMinutes'] > 0 ? (int)$s['lateMinutes'] . ' min' : ($out ? '' : 'did not sign out')];
        } else {
            $register[] = ['date' => $d, 'mark' => in_array($d, $unexcused, true) ? 'Absent (unexcused)' : 'Absent', 'detail' => ''];
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
    $charged = []; $received = []; $fines = [];
    foreach (db_all("SELECT kind, direction, amount, note, createdAt FROM member_ledger WHERE memberId = ? AND (voidedAt IS NULL OR voidedAt = '')
                     AND substr(createdAt, 1, 10) BETWEEN ? AND ? ORDER BY id", [$mid, $from, $to]) as $e) {
        $k = (string)$e['kind'];
        if ($k === 'training' || $k === 'writeoff') continue;   // the training place is its own account
        if ((string)$e['direction'] === 'charge') {
            $charged[$k] = ($charged[$k] ?? 0) + (int)$e['amount'];
            if ($k === 'fine') $fines[] = ['date' => substr((string)$e['createdAt'], 0, 10), 'reason' => (string)$e['note'], 'amount' => (int)$e['amount']];
        } else {
            $received[$k] = ($received[$k] ?? 0) + (int)$e['amount'];
        }
    }
    $payable = 0; $open = [];
    if (function_exists('fees_balance')) {
        try {
            $bal = fees_balance($m);
            $payable = max(0, (int)($bal['payable'] ?? 0));
            if ($payable > 0 && function_exists('fees_account_statement')) {
                foreach (array_slice(fees_account_statement($m, $bal)['open'], 0, 8) as $o) {
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
        'v' => 1, 'kind' => $kind, 'label' => $label, 'from' => $from, 'to' => $to, 'asOf' => $asOf,
        'subject' => ['type' => 'member', 'id' => $mid, 'name' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                      'centre' => (string)($m['centre'] ?? ''), 'courses' => $courses, 'mentor' => (string)($mentor['fullName'] ?? '')],
        'attendance' => ['days' => count($days), 'present' => $present, 'late' => $late, 'absent' => $absent, 'unexcused' => count(array_intersect($unexcused, $days)),
                         'noSignOut' => $noOut, 'rate' => preport_pct($present, count($days)), 'register' => $register],
        'learning' => ['lessons' => array_map(static fn($l) => ['title' => (string)$l['title'], 'course' => (string)$l['course'], 'pct' => (int)$l['bestPct'], 'date' => substr((string)$l['completedAt'], 0, 10)], $lessons),
                       'exams' => array_map(static fn($x) => ['what' => (string)($x['title'] ?: $x['course']), 'kind' => (string)$x['kind'], 'pct' => (int)$x['pct'], 'band' => (string)$x['band'], 'date' => substr((string)$x['submittedAt'], 0, 10)], $exams),
                       'certificates' => array_map(static function ($c) { $d = safe_json((string)$c['data']) ?: []; return ['no' => (string)$c['docNo'], 'title' => (string)($d['title'] ?? $d['course'] ?? 'Certificate'), 'date' => substr((string)$c['issuedAt'], 0, 10)]; }, $certs),
                       'completed' => (int)($overall['completed'] ?? 0), 'total' => (int)($overall['total'] ?? 0), 'overdue' => (int)($overall['overdue'] ?? 0)],
        'conduct' => array_map(static fn($s) => ['kind' => (string)$s['kind'], 'reason' => (string)$s['reason'], 'amount' => (int)$s['amount'], 'status' => (string)$s['status'], 'date' => substr((string)$s['issuedAt'], 0, 10)], $sanctions),
        'money' => ['charged' => $charged, 'received' => $received, 'fines' => $fines, 'chargedTotal' => array_sum($charged), 'receivedTotal' => array_sum($received),
                    'payable' => $payable, 'open' => $open],
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

/** The plain-words opening paragraph — what a parent reads if they read nothing else. */
function preport_headline(array $r): string {
    $first = mp_first((string)$r['subject']['name']) ?: 'Your child';
    $a = $r['attendance']; $parts = [];
    if ($a['days'] > 0) {
        $parts[] = $first . ' attended ' . $a['present'] . ' of ' . $a['days'] . ' programme day' . ($a['days'] === 1 ? '' : 's') . ' (' . (int)$a['rate'] . '%)'
            . ($a['late'] ? ', arriving late ' . ([1 => 'once', 2 => 'twice'][$a['late']] ?? $a['late'] . ' times') : '') . '.';
    } else {
        $parts[] = 'There were no programme days for ' . $first . ' in this period.';
    }
    if (!empty($r['learning'])) {
        $L = $r['learning'];
        $parts[] = count($L['lessons']) . ' lesson' . (count($L['lessons']) === 1 ? ' was' : 's were') . ' completed in the period'
            . ($L['overdue'] ? ', and ' . $L['overdue'] . ' ' . ($L['overdue'] === 1 ? 'is' : 'are') . ' overdue' : '') . '.';
    }
    if (!empty($r['money'])) {
        $M = $r['money'];
        $parts[] = $M['payable'] > 0 ? 'The balance to pay on ' . preport_date($r['asOf']) . ' is ' . preport_money($M['payable']) . '.' : 'The account is fully paid.';
    }
    return implode(' ', $parts);
}

/* ── The document ─────────────────────────────────────────────────────── */

/**
 * The report as HTML: inline styles only, so the same markup is the email body and the printable page. Tables,
 * not grids — mail clients still read tables best. Contrast: #16233f and #3d4560 on white (15:1, 9:1).
 */
function preport_html(array $r, bool $page = false, string $reportNo = ''): string {
    $e = static fn($s) => esc_html((string)$s);
    $ink = '#16233f'; $soft = '#3d4560'; $line = '#d5dae6'; $band = '#f3f5fa'; $gold = '#f5b026';
    $th = "style=\"text-align:left;padding:7px 10px;border-bottom:1px solid $line;background:$band;font-size:12.5px;color:$ink\"";
    $td = "style=\"padding:7px 10px;border-bottom:1px solid $line;font-size:13.5px;color:$ink;vertical-align:top\"";
    $tdr = "style=\"padding:7px 10px;border-bottom:1px solid $line;font-size:13.5px;color:$ink;text-align:right;white-space:nowrap\"";
    $h2 = static fn($t) => "<h2 style=\"font:800 16px/1.3 Arial,Helvetica,sans-serif;color:$ink;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid $gold\">" . esc_html($t) . '</h2>';
    $table = static function (array $head, array $rows, array $right = []) use ($th, $td, $tdr, $e, $soft): string {
        if (!$rows) return '';
        $h = '<tr>';
        foreach (array_values($head) as $i => $x) $h .= '<th scope="col" ' . (in_array($i, $right, true) ? str_replace('text-align:left', 'text-align:right', $th) : $th) . '>' . esc_html($x) . '</th>';
        $h .= '</tr>';
        $b = '';
        foreach ($rows as $row) { $b .= '<tr>'; foreach (array_values($row) as $i => $c) $b .= '<td ' . (in_array($i, $right, true) ? $tdr : $td) . '>' . $e($c) . '</td>'; $b .= '</tr>'; }
        return "<table role=\"table\" style=\"width:100%;border-collapse:collapse;margin:0 0 6px\">$h$b</table>";
    };
    $none = static fn($t) => "<p style=\"margin:4px 0 0;font-size:13.5px;color:$soft\">" . esc_html($t) . '</p>';
    $S = $r['subject']; $A = $r['attendance'];
    $title = ['month' => 'Monthly Progress Report', 'session' => 'End of Session Report', 'edition' => 'Summer School Report'][$r['kind']] ?? 'Progress Report';
    $kv = [['Name', $S['name']], ['ID number', $S['displayId'] ?: '—'], ['Centre', $S['centre'] ?: '—']];
    if (!empty($S['group'])) $kv[] = ['Group', $S['group']];
    if (!empty($S['courses'])) $kv[] = ['Courses', implode(', ', $S['courses'])];
    if (!empty($S['mentor'])) $kv[] = ['Mentor', $S['mentor']];
    $kv[] = ['Period', preport_date($r['from']) . ' – ' . preport_date($r['to'])];
    if ($reportNo !== '') $kv[] = ['Report no.', $reportNo];
    $idt = '';
    foreach ($kv as [$k, $v]) $idt .= "<tr><th scope=\"row\" style=\"text-align:left;padding:4px 14px 4px 0;font-size:12.5px;color:$soft;font-weight:700;white-space:nowrap\">" . $e($k) . "</th><td style=\"padding:4px 0;font-size:13.5px;color:$ink\">" . $e($v) . '</td></tr>';

    $html = "<div style=\"font-family:Arial,Helvetica,sans-serif;color:$ink;max-width:720px;margin:0 auto\">";
    $html .= "<table style=\"width:100%;border-collapse:collapse\"><tr><td style=\"vertical-align:top\"><div style=\"font:800 12px Arial;letter-spacing:.06em;color:$soft\">NEXT GENERATION GENIUS · AFROVANGUARD</div>"
           . "<div style=\"font:800 24px/1.2 Arial;color:$ink;margin:6px 0 2px\">" . $e($title) . "</div><div style=\"font-size:14px;color:$soft\">" . $e($r['label']) . '</div></td>'
           . "<td style=\"vertical-align:top;text-align:right;font-size:12px;color:$soft;white-space:nowrap\">Issued " . $e(preport_date($r['asOf'])) . '</td></tr></table>';
    $html .= "<table style=\"border-collapse:collapse;margin:16px 0 4px\">$idt</table>";
    $html .= "<div style=\"background:$band;border-left:4px solid $gold;padding:12px 14px;margin:14px 0 4px;font-size:14.5px;line-height:1.5;color:$ink\">" . $e(preport_headline($r)) . '</div>';

    // Attendance
    $html .= $h2('Attendance');
    $html .= $table(['Programme days', 'Present', 'Late', 'Absent', 'Unexcused', 'Rate'],
        [[$A['days'], $A['present'], $A['late'], $A['absent'], $A['unexcused'], $A['rate'] === null ? '—' : $A['rate'] . '%']]);
    if ($A['noSignOut']) $html .= $none('Did not sign out on ' . $A['noSignOut'] . ' day' . ($A['noSignOut'] === 1 ? '' : 's') . ' — please make sure your child signs out at the desk.');
    if ($A['register'] && count($A['register']) <= 31) $html .= $table(['Date', 'Mark', 'Note'], array_map(static fn($x) => [preport_date($x['date']), $x['mark'], $x['detail']], $A['register']));

    // Learning
    if (!empty($r['learning'])) {
        $L = $r['learning'];
        $html .= $h2('Learning');
        $html .= $table(['Lessons completed this period', 'All lessons to date', 'Overdue'], [[count($L['lessons']), $L['completed'] . ' of ' . $L['total'], $L['overdue']]]);
        if ($L['lessons']) $html .= $table(['Lesson', 'Course', 'Score'], array_map(static fn($x) => [$x['title'], $x['course'], $x['pct'] . '%'], array_slice($L['lessons'], 0, 20)), [2]);
        if ($L['exams']) $html .= $table(['Exam', 'Date', 'Score', 'Band'], array_map(static fn($x) => [$x['what'], preport_date($x['date']), $x['pct'] . '%', $x['band'] ?: '—'], $L['exams']), [2]);
        if ($L['certificates']) $html .= $table(['Certificate', 'Number', 'Issued'], array_map(static fn($x) => [$x['title'], $x['no'], preport_date($x['date'])], $L['certificates']));
        if (!$L['lessons'] && !$L['exams']) $html .= $none('No lessons were completed in this period.');
    }

    // Conduct
    $html .= $h2('Conduct');
    $html .= $r['conduct'] ? $table(['Date', 'Record', 'Reason', 'Status'], array_map(static fn($x) => [preport_date($x['date']), ucfirst(str_replace('_', ' ', $x['kind'])) . ($x['amount'] ? ' (' . preport_money($x['amount']) . ')' : ''), $x['reason'], ucfirst($x['status'])], $r['conduct']))
                           : $none('No conduct records in this period. Thank you.');

    // Fees, fines and dues
    if (!empty($r['money'])) {
        $M = $r['money'];
        $lbl = ['membership' => 'Membership fee', 'dues' => 'Monthly dues', 'fine' => 'Fines', 'adjustment' => 'Adjustments', 'payment' => 'Payments received', 'waiver' => 'Waived'];
        $html .= $h2('Fees, dues and fines');
        $rows = [];
        foreach ($M['charged'] as $k => $v) $rows[] = ['Charged: ' . ($lbl[$k] ?? ucfirst($k)), preport_money($v)];
        foreach ($M['received'] as $k => $v) $rows[] = [($lbl[$k] ?? ucfirst($k)), '− ' . preport_money($v)];
        $html .= $rows ? $table(['This period', 'Amount'], $rows, [1]) : $none('Nothing was charged or paid in this period.');
        if ($M['fines']) $html .= $table(['Fine', 'Date', 'Amount'], array_map(static fn($x) => [$x['reason'] ?: 'Fine', preport_date($x['date']), preport_money($x['amount'])], $M['fines']), [2]);
        $html .= "<table style=\"width:100%;border-collapse:collapse;margin:8px 0 0\"><tr><td style=\"padding:10px;background:" . ($M['payable'] > 0 ? '#fff4d6' : '#e6f4ea') . ";font:800 15px Arial;color:$ink\">Balance to pay on " . $e(preport_date($r['asOf'])) . "</td><td style=\"padding:10px;background:" . ($M['payable'] > 0 ? '#fff4d6' : '#e6f4ea') . ";font:800 15px Arial;color:$ink;text-align:right\">" . $e(preport_money($M['payable'])) . '</td></tr></table>';
        if ($M['open']) $html .= $table(['Still owed', 'Due', 'Amount'], array_map(static fn($x) => [$x['what'], $x['due'] ? preport_date($x['due']) : '—', preport_money($x['left'])], $M['open']), [2]);
        if ($M['payable'] > 0) $html .= $none('Pay in the family account (Fees), or at the centre desk. If you have already paid, send the receipt from Fees and it will be matched.');
    }

    // The people around them
    if (!empty($r['people']) && ($r['people']['leadership'] !== null || $r['people']['note'] !== '')) {
        $P = $r['people'];
        $html .= $h2('Mentor and progress');
        if ($P['leadership'] !== null) $html .= $table(['Leadership Index'], [[$P['leadership'] . ' of 100']]);
        if ($P['note'] !== '') $html .= "<p style=\"margin:8px 0 0;font-size:13.5px;line-height:1.5;color:$ink\">" . $e($P['note']) . '</p>';
    }

    // Acknowledgement
    $html .= $h2('Acknowledgement');
    $html .= "<p style=\"margin:4px 0 14px;font-size:13.5px;color:$soft\">Please sign this report in the family account so " . $e(mp_first((string)$S['name']) ?: 'your child') . "’s mentor knows home has read it. Questions about anything in it: reply to this email or speak to the centre.</p>";
    $html .= "<table style=\"width:100%;border-collapse:collapse\"><tr><td style=\"width:50%;padding:24px 16px 4px 0;border-bottom:1px solid $ink\"></td><td style=\"width:50%;padding:24px 0 4px 16px;border-bottom:1px solid $ink\"></td></tr>"
           . "<tr><td style=\"font-size:12px;color:$soft;padding:4px 16px 0 0\">For NGG — Programme Coordinator</td><td style=\"font-size:12px;color:$soft;padding:4px 0 0 16px\">Parent / guardian</td></tr></table>";
    $html .= "<p style=\"margin:18px 0 0;font-size:11.5px;color:$soft\">This report was produced from NGG's attendance, learning, conduct and accounts records as they stood on " . $e(preport_date($r['asOf'])) . '. It is kept on file as issued.</p>';
    $html .= '</div>';
    if (!$page) return $html;
    return '<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $e($title . ' — ' . $S['name'] . ' — ' . $r['label']) . '</title>'
         . '<style>body{margin:0;padding:16px;background:#e9ecf3}.sheet{background:#fff;max-width:760px;margin:0 auto;padding:clamp(16px,4vw,40px);border-radius:8px}'
         . '.bar{max-width:760px;margin:0 auto 10px;text-align:right}.bar button{min-height:44px;padding:0 16px;border-radius:8px;border:1px solid #16233f;background:#16233f;color:#fff;font:700 15px Arial;cursor:pointer}'
         . '@media print{body{background:#fff;padding:0}.bar{display:none}.sheet{padding:0;border-radius:0}}</style>'
         . '<div class="bar"><button type="button" onclick="window.print()">Print or save as PDF</button></div><div class="sheet">' . $html . '</div></html>';
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
                'bodyHtml' => preport_html($data, false, (string)$rep['reportId']),
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
                    'preheader' => preport_headline($data), 'bodyHtml' => preport_html($data, false, (string)$rep['reportId']),
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
