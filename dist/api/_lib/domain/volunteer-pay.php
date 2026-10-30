<?php
/**
 * domain/volunteer-pay.php — what an active NGG volunteer earns for being
 * present, and active, on a programme day.
 *
 * ── HOW A DAY IS EARNED ─────────────────────────────────────────────────────
 * Once a day is over, each volunteer checked in on it (attendance) gets ONE
 * row in volunteer_pay, decided then and never re-decided by a later rule
 * change: `earned` at the rate in force that day, or `excluded` with the
 * reason. What counts as active, and what excludes a day, are the admin's
 * (VOLPAY_DEFAULTS, the `volunteerPay` setting):
 *
 *   present      a check-in on the day, as the volunteer or as the member they
 *                also are (volunteers.memberId)
 *   a day        a day of their programme's calendar (Club, Summer School, or
 *                either for both), unless `days` is `any`
 *   active       at least one of the chosen activities that day: checked out
 *                at the end, completed the attendance duty, earned volunteer
 *                points, or led a class session
 *   excluded     late by more than N minutes, a red line, a half day, no
 *                check-out, safeguarding not cleared, not an active volunteer,
 *                over the period's day cap — each switched on or off by admin —
 *                and a day an admin excludes by hand, with the reason
 *
 * ── HOW IT IS PAID ──────────────────────────────────────────────────────────
 * Earnings are grouped into pay periods of the admin's frequency (weekly,
 * fortnightly, monthly). A period is paid only once it has ended; a payout
 * settles a volunteer's earned, unpaid days of that period, with how and the
 * reference. A payout can be voided, which frees its days to be paid again.
 * Nothing here moves money: it records what is owed and what was paid.
 *
 * Whole naira, like member_ledger. Money is the `fees` capability, never
 * bundled into a broader role (CLAUDE.md §4).
 */
declare(strict_types=1);

const VOLPAY_DEFAULTS = [
    'enabled'           => false,
    'amount'            => 0,          // naira, each day earned
    'frequency'         => 'monthly',  // weekly | fortnightly | monthly
    'maxDaysPerPeriod'  => 0,          // 0 = no cap
    'startDate'         => '',         // nothing before it is decided; set when switched on
    'days'              => 'programme',// programme | any
    'requireActivity'   => true,
    'activities'        => ['checkout', 'duty', 'points', 'session'],
    'lateAfterMin'      => 0,          // 0 = lateness never excludes
    'excludeNoCheckout' => false,
    'excludeHalfDay'    => true,
    'excludeRedline'    => true,
    'excludeUncleared'  => true,
];
const VOLPAY_FREQUENCIES = ['weekly' => 'Weekly', 'fortnightly' => 'Every two weeks', 'monthly' => 'Monthly'];
const VOLPAY_ACTIVITIES = ['checkout' => 'Checked out at the end of the day', 'duty' => 'Completed the attendance duty',
                           'points' => 'Earned volunteer points', 'session' => 'Led a class session'];
const VOLPAY_REASONS = [
    'not_active' => 'Not an active volunteer that day', 'not_cleared' => 'Safeguarding not cleared',
    'not_programme_day' => 'Not a programme day', 'late' => 'Arrived too late', 'redline' => 'Past the red line',
    'half_day' => 'Half day', 'no_checkout' => 'Did not check out', 'no_activity' => 'Present, but no activity recorded',
    'period_cap' => 'Over the most days paid in one period', 'admin' => 'Excluded by an admin',
];
const VOLPAY_AMOUNT_MAX = 500000;
const VOLPAY_PAY_MAX = 500;       // volunteers paid in one press
const VOLPAY_ACCRUE_MAX = 5000;   // check-ins decided in one run; the rest at the next
const VOLPAY_METHODS = ['transfer' => 'Bank transfer', 'cash' => 'Cash', 'other' => 'Other'];

function volpay_settings(): array {
    $c = setting_get('volunteerPay');
    $c = (is_array($c) ? $c : []) + VOLPAY_DEFAULTS;
    $c['activities'] = array_values(array_intersect((array)$c['activities'], array_keys(VOLPAY_ACTIVITIES)));
    if (!isset(VOLPAY_FREQUENCIES[$c['frequency']])) $c['frequency'] = 'monthly';
    return $c;
}

/** Saves what was sent over what is there. Switching on needs an amount; the start date defaults to today. */
function volpay_settings_save(array $in, string $by): array {
    $cur = volpay_settings();
    $b = fn(string $k) => array_key_exists($k, $in) ? !empty($in[$k]) : !empty($cur[$k]);
    $n = fn(string $k, int $lo, int $hi) => array_key_exists($k, $in) ? max($lo, min($hi, (int)$in[$k])) : (int)$cur[$k];
    $c = [
        'enabled' => $b('enabled'),
        'amount' => $n('amount', 0, VOLPAY_AMOUNT_MAX),
        'frequency' => isset(VOLPAY_FREQUENCIES[$in['frequency'] ?? '']) ? (string)$in['frequency'] : $cur['frequency'],
        'maxDaysPerPeriod' => $n('maxDaysPerPeriod', 0, 31),
        'startDate' => array_key_exists('startDate', $in) ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$in['startDate']) ? (string)$in['startDate'] : '') : $cur['startDate'],
        'days' => in_array($in['days'] ?? '', ['programme', 'any'], true) ? (string)$in['days'] : $cur['days'],
        'requireActivity' => $b('requireActivity'),
        'activities' => array_key_exists('activities', $in) ? array_values(array_intersect((array)$in['activities'], array_keys(VOLPAY_ACTIVITIES))) : $cur['activities'],
        'lateAfterMin' => $n('lateAfterMin', 0, 240),
        'excludeNoCheckout' => $b('excludeNoCheckout'), 'excludeHalfDay' => $b('excludeHalfDay'),
        'excludeRedline' => $b('excludeRedline'), 'excludeUncleared' => $b('excludeUncleared'),
    ];
    if ($c['enabled'] && $c['amount'] <= 0) return ['ok' => false, 'error' => 'amount_required', 'message' => 'Set the amount a volunteer earns each day before switching volunteer pay on.'];
    if ($c['enabled'] && $c['requireActivity'] && !$c['activities']) return ['ok' => false, 'error' => 'activity_required', 'message' => 'Choose at least one activity that counts, or stop requiring one.'];
    /* Switched on with no start: from today, so switching on never pays the
       whole history of check-ins at once. */
    if ($c['enabled'] && $c['startDate'] === '') $c['startDate'] = date('Y-m-d');
    setting_set('volunteerPay', $c, $by);
    return ['ok' => true, 'settings' => volpay_settings()];
}

/* ── Periods ──────────────────────────────────────────────────────────────── */

/** [key, first day, last day] of the pay period holding $day. Keys sort within a frequency and carry their own dates. */
function volpay_period(string $day, string $freq): array {
    $t = (int)strtotime($day . ' 12:00:00 UTC');
    if ($freq === 'monthly') { $a = gmdate('Y-m-01', $t); return ['M' . substr($a, 0, 7), $a, gmdate('Y-m-t', $t)]; }
    $monday = $t - ((int)gmdate('N', $t) - 1) * 86400;
    if ($freq === 'fortnightly') {
        /* Fortnights counted from a fixed Monday, so they never shift with the year. */
        $anchor = (int)strtotime('2024-01-01 12:00:00 UTC');
        $monday = $anchor + intdiv(intdiv($monday - $anchor, 86400), 14) * 14 * 86400;
        return ['F' . gmdate('Y-m-d', $monday), gmdate('Y-m-d', $monday), gmdate('Y-m-d', $monday + 13 * 86400)];
    }
    return ['W' . gmdate('Y-m-d', $monday), gmdate('Y-m-d', $monday), gmdate('Y-m-d', $monday + 6 * 86400)];
}

/** [first, last, label] from a stored key, whatever the frequency was. */
function volpay_period_of_key(string $key): ?array {
    if (preg_match('/^M(\d{4}-\d{2})$/', $key, $m)) { $a = $m[1] . '-01'; return [$a, gmdate('Y-m-t', (int)strtotime($a . ' 12:00:00 UTC')), gmdate('F Y', (int)strtotime($a . ' 12:00:00 UTC'))]; }
    if (preg_match('/^([WF])(\d{4}-\d{2}-\d{2})$/', $key, $m)) {
        $a = $m[2]; $z = gmdate('Y-m-d', (int)strtotime($a . ' 12:00:00 UTC') + ($m[1] === 'F' ? 13 : 6) * 86400);
        return [$a, $z, gmdate('j M', (int)strtotime($a . ' 12:00:00 UTC')) . ' – ' . gmdate('j M Y', (int)strtotime($z . ' 12:00:00 UTC'))];
    }
    return null;
}

/* ── Deciding days ────────────────────────────────────────────────────────── */

/** Is $day a programme day for a volunteer of this programme ('ngg', 'summer', 'both')? */
function volpay_is_programme_day(string $day, string $programme, array $cals): bool {
    $club = programme_is_day($day, $cals['club']); $summer = programme_is_day($day, $cals['summer']);
    if ($programme === 'summer') return $summer;
    if ($programme === 'both') return $club || $summer;
    return $club;
}

/**
 * The verdict on one volunteer's day: ['earned', '', activity] or
 * ['excluded', reason, activity]. Pure: everything it needs is passed in, so
 * the rules are pinned by tests without a database.
 *
 * $att: the attendance row; $vol: the volunteer row; $act: activity names seen that day.
 */
function volpay_decide(array $cfg, array $att, array $vol, array $act, bool $programmeDay): array {
    $a = implode(',', $act);
    if ((string)($vol['status'] ?? '') !== 'active') return ['excluded', 'not_active', $a];
    if (!empty($cfg['excludeUncleared']) && (string)($vol['safeguarding'] ?? '') !== 'cleared') return ['excluded', 'not_cleared', $a];
    if ($cfg['days'] !== 'any' && !$programmeDay) return ['excluded', 'not_programme_day', $a];
    if ((int)$cfg['lateAfterMin'] > 0 && (int)($att['lateMinutes'] ?? 0) > (int)$cfg['lateAfterMin']) return ['excluded', 'late', $a];
    if (!empty($cfg['excludeRedline']) && !empty($att['redline'])) return ['excluded', 'redline', $a];
    if (!empty($cfg['excludeHalfDay']) && !empty($att['halfDay'])) return ['excluded', 'half_day', $a];
    if (!empty($cfg['excludeNoCheckout']) && trim((string)($att['checkOutAt'] ?? '')) === '') return ['excluded', 'no_checkout', $a];
    if (!empty($cfg['requireActivity']) && !array_intersect($act, (array)$cfg['activities'])) return ['excluded', 'no_activity', $a];
    return ['earned', '', $a];
}

/**
 * Decide every finished day not decided yet, from the start date to
 * yesterday. A few queries for the whole run, never one per volunteer.
 */
function volpay_accrue(?string $until = null): array {
    $cfg = volpay_settings();
    if (empty($cfg['enabled'])) return ['ok' => true, 'skipped' => 'off', 'decided' => 0];
    $until = $until ?? date('Y-m-d', time() - 86400);
    $from = $cfg['startDate'] ?: $until;
    if ($from > $until) return ['ok' => true, 'decided' => 0, 'earned' => 0];

    $vols = db_all("SELECT volunteerId, memberId, status, safeguarding, programme, centre FROM volunteers");
    if (!$vols) return ['ok' => true, 'decided' => 0, 'earned' => 0];
    $byVol = []; $byPerson = [];
    foreach ($vols as $v) {
        $byVol[(string)$v['volunteerId']] = $v;
        $byPerson[(string)$v['volunteerId']] = (string)$v['volunteerId'];
        if ((string)($v['memberId'] ?? '') !== '') $byPerson[(string)$v['memberId']] = (string)$v['volunteerId'];
    }
    $ids = array_keys($byPerson);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $att = db_all("SELECT studentId, date, checkInAt, checkOutAt, lateMinutes, redline, halfDay, centre FROM attendance
                    WHERE date >= ? AND date <= ? AND studentId IN ($in) ORDER BY date, checkInAt LIMIT " . VOLPAY_ACCRUE_MAX, array_merge([$from, $until], $ids));
    if (!$att) return ['ok' => true, 'decided' => 0, 'earned' => 0];
    $done = [];
    foreach (db_all('SELECT volunteerId, day FROM volunteer_pay WHERE day >= ? AND day <= ?', [$from, $until]) as $r) $done[$r['volunteerId'] . '|' . $r['day']] = true;

    /* The day's activity, all volunteers at once. */
    $seen = [];
    foreach (db_all("SELECT volunteerId, date FROM attendance_duty WHERE date >= ? AND date <= ? AND completedAt IS NOT NULL AND completedAt != ''", [$from, $until]) as $r) $seen[$r['volunteerId'] . '|' . $r['date']]['duty'] = true;
    foreach (db_all("SELECT volunteerId, date FROM volunteer_points WHERE date >= ? AND date <= ? AND points > 0", [$from, $until]) as $r) $seen[$r['volunteerId'] . '|' . $r['date']]['points'] = true;
    foreach (['club_class_sessions', 'course_sessions'] as $t) {
        foreach (db_all("SELECT instructorId, date FROM $t WHERE date >= ? AND date <= ? AND instructorId != ''", [$from, $until]) as $r) {
            $vid = $byPerson[(string)$r['instructorId']] ?? null;
            if ($vid !== null) $seen[$vid . '|' . $r['date']]['session'] = true;
        }
    }
    $cals = ['club' => member_programme_settings(), 'summer' => programme_settings()];
    /* The day cap counts what each period already holds. */
    $inPeriod = [];
    if ((int)$cfg['maxDaysPerPeriod'] > 0) {
        foreach (db_all("SELECT volunteerId, periodKey, COUNT(*) n FROM volunteer_pay WHERE status = 'earned' GROUP BY volunteerId, periodKey") as $r) $inPeriod[$r['volunteerId'] . '|' . $r['periodKey']] = (int)$r['n'];
    }
    $decided = 0; $earned = 0; $now = now_iso();
    foreach ($att as $a) {
        $vid = $byPerson[(string)$a['studentId']] ?? null;
        if ($vid === null || isset($done[$vid . '|' . $a['date']])) continue;
        $done[$vid . '|' . $a['date']] = true;
        $v = $byVol[$vid];
        $act = array_keys($seen[$vid . '|' . $a['date']] ?? []);
        if (trim((string)($a['checkOutAt'] ?? '')) !== '') $act[] = 'checkout';
        sort($act);
        [$status, $reason, $actText] = volpay_decide($cfg, $a, $v, $act, volpay_is_programme_day((string)$a['date'], (string)($v['programme'] ?? 'ngg'), $cals));
        [$pk] = volpay_period((string)$a['date'], $cfg['frequency']);
        if ($status === 'earned' && (int)$cfg['maxDaysPerPeriod'] > 0 && ($inPeriod[$vid . '|' . $pk] ?? 0) >= (int)$cfg['maxDaysPerPeriod']) { $status = 'excluded'; $reason = 'period_cap'; }
        if ($status === 'earned') $inPeriod[$vid . '|' . $pk] = ($inPeriod[$vid . '|' . $pk] ?? 0) + 1;
        db_insert('volunteer_pay', ['volunteerId' => $vid, 'day' => (string)$a['date'], 'centre' => (string)(($a['centre'] ?? '') !== '' ? $a['centre'] : ($v['centre'] ?? '')),
            'status' => $status, 'amount' => $status === 'earned' ? (int)$cfg['amount'] : 0, 'rate' => (int)$cfg['amount'], 'reason' => $reason,
            'activity' => $actText, 'periodKey' => $pk, 'decidedAt' => $now]);
        $decided++; if ($status === 'earned') $earned++;
    }
    return ['ok' => true, 'decided' => $decided, 'earned' => $earned, 'more' => count($att) >= VOLPAY_ACCRUE_MAX];
}

/** The web-cron tick: once an hour is plenty, a day is decided once it is over. */
function volpay_tick(): array {
    try { return volpay_accrue(); } catch (Throwable $e) { return ['ok' => false, 'error' => $e->getMessage()]; }
}

/* ── One volunteer's wallet ───────────────────────────────────────────────── */

function volpay_row_view(array $r): array {
    return ['day' => (string)$r['day'], 'centre' => (string)$r['centre'], 'status' => (string)$r['status'], 'amount' => (int)$r['amount'], 'rate' => (int)$r['rate'],
            'reason' => (string)$r['reason'], 'reasonText' => VOLPAY_REASONS[(string)$r['reason']] ?? '', 'activity' => array_values(array_filter(explode(',', (string)$r['activity']))),
            'periodKey' => (string)$r['periodKey'], 'paid' => (string)$r['payoutId'] !== '', 'payoutId' => (string)$r['payoutId'],
            'override' => (string)$r['overrideBy'] !== '' ? ['reason' => (string)$r['overrideReason'], 'at' => (string)$r['overrideAt']] : null];
}

/** Balance (earned, not yet paid), what was earned and paid in all, every day (newest first) and every payout. */
function volpay_wallet(string $volunteerId, bool $staff): array {
    $sum = db_row("SELECT COALESCE(SUM(CASE WHEN status = 'earned' AND payoutId = '' THEN amount ELSE 0 END), 0) owed,
                          COALESCE(SUM(CASE WHEN status = 'earned' THEN amount ELSE 0 END), 0) earned,
                          SUM(CASE WHEN status = 'earned' THEN 1 ELSE 0 END) daysEarned, SUM(CASE WHEN status = 'excluded' THEN 1 ELSE 0 END) daysExcluded
                     FROM volunteer_pay WHERE volunteerId = ?", [$volunteerId]) ?? [];
    $paid = (int)(db_row("SELECT COALESCE(SUM(amount), 0) n FROM volunteer_payouts WHERE volunteerId = ? AND voidedAt = ''", [$volunteerId])['n'] ?? 0);
    $days = array_map('volpay_row_view', db_all('SELECT * FROM volunteer_pay WHERE volunteerId = ? ORDER BY day DESC LIMIT 200', [$volunteerId]));
    if (!$staff) foreach ($days as &$d) { if ($d['override']) $d['override'] = ['reason' => $d['override']['reason']]; } unset($d);
    $payouts = array_map(static fn($p) => ['payoutId' => (string)$p['payoutId'], 'periodKey' => (string)$p['periodKey'], 'period' => (volpay_period_of_key((string)$p['periodKey']) ?? [2 => ''])[2],
        'amount' => (int)$p['amount'], 'days' => (int)$p['days'], 'method' => (string)$p['method'], 'methodText' => VOLPAY_METHODS[(string)$p['method']] ?? '',
        'reference' => $staff ? (string)$p['reference'] : '', 'paidAt' => (string)$p['paidAt'], 'void' => (string)$p['voidedAt'] !== '', 'voidReason' => (string)$p['voidReason']],
        db_all('SELECT * FROM volunteer_payouts WHERE volunteerId = ? ORDER BY paidAt DESC LIMIT 60', [$volunteerId]));
    $cfg = volpay_settings();
    [, , $pEnd] = volpay_period(date('Y-m-d'), $cfg['frequency']);
    return ['owed' => (int)($sum['owed'] ?? 0), 'earned' => (int)($sum['earned'] ?? 0), 'paid' => $paid,
            'daysEarned' => (int)($sum['daysEarned'] ?? 0), 'daysExcluded' => (int)($sum['daysExcluded'] ?? 0),
            'rate' => (int)$cfg['amount'], 'frequency' => $cfg['frequency'], 'frequencyText' => VOLPAY_FREQUENCIES[$cfg['frequency']],
            'periodEnds' => $pEnd, 'on' => !empty($cfg['enabled']), 'days' => $days, 'payouts' => $payouts];
}

/* ── The desk ─────────────────────────────────────────────────────────────── */

/** A volunteer the requester may act on: exists, and inside their centre scope. */
function volpay_volunteer_gate(array $requester, string $volunteerId): ?array {
    $v = db_row('SELECT volunteerId, fullName, centre, memberId, status, programme FROM volunteers WHERE volunteerId = ? LIMIT 1', [$volunteerId]);
    if (!$v || !admin_centre_allowed($requester, (string)($v['centre'] ?? ''))) return null;
    return $v;
}

function admin_volpay_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => volpay_settings(), 'defaults' => VOLPAY_DEFAULTS, 'amountMax' => VOLPAY_AMOUNT_MAX, 'payMax' => VOLPAY_PAY_MAX,
            'frequencies' => VOLPAY_FREQUENCIES, 'activities' => VOLPAY_ACTIVITIES, 'reasons' => VOLPAY_REASONS, 'methods' => VOLPAY_METHODS];
}

function admin_volpay_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $before = volpay_settings();
    $r = volpay_settings_save(is_array($p['data'] ?? null) ? $p['data'] : [], (string)$g['requester']['memberId']);
    if (!empty($r['ok'])) audit('volpay.settings', (string)$g['requester']['memberId'], 'volunteerPay',
        ['changed' => array_keys(array_filter($r['settings'], static fn($v, $k) => ($before[$k] ?? null) !== $v, ARRAY_FILTER_USE_BOTH))], (string)($p['ip'] ?? ''));
    return $r;
}

/** Decide every finished day now, rather than at the next tick. */
function admin_volpay_accrue(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    return volpay_accrue();
}

/**
 * One pay period, every volunteer with a day in it: days earned and excluded,
 * the amount, and whether it is paid. With the periods there are to choose from.
 */
function admin_volpay_period(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = volpay_settings();
    [$cur] = volpay_period(date('Y-m-d'), $cfg['frequency']);
    $keys = array_column(db_all('SELECT DISTINCT periodKey FROM volunteer_pay ORDER BY periodKey DESC LIMIT 36'), 'periodKey');
    if (!in_array($cur, $keys, true)) array_unshift($keys, $cur);
    usort($keys, static fn($a, $b) => strcmp((volpay_period_of_key($b) ?? [''])[0], (volpay_period_of_key($a) ?? [''])[0]));
    $key = in_array((string)($p['period'] ?? ''), $keys, true) ? (string)$p['period'] : $keys[0];
    $span = volpay_period_of_key($key);
    $scope = admin_centre_names_in_scope($g['requester']);
    $rows = db_all("SELECT p.volunteerId, v.fullName, v.centre, v.memberId,
                           SUM(CASE WHEN p.status = 'earned' THEN 1 ELSE 0 END) earnedDays, SUM(CASE WHEN p.status = 'excluded' THEN 1 ELSE 0 END) excludedDays,
                           SUM(CASE WHEN p.status = 'earned' THEN p.amount ELSE 0 END) amount,
                           SUM(CASE WHEN p.status = 'earned' AND p.payoutId = '' THEN p.amount ELSE 0 END) unpaid,
                           MAX(p.payoutId) payoutId
                      FROM volunteer_pay p LEFT JOIN volunteers v ON v.volunteerId = p.volunteerId
                     WHERE p.periodKey = ? GROUP BY p.volunteerId, v.fullName, v.centre, v.memberId ORDER BY v.fullName", [$key]);
    $out = []; $tot = ['earned' => 0, 'unpaid' => 0, 'people' => 0, 'daysEarned' => 0, 'daysExcluded' => 0];
    foreach ($rows as $r) {
        if ($scope !== null && !in_array((string)$r['centre'], $scope, true)) continue;
        $o = ['volunteerId' => (string)$r['volunteerId'], 'name' => (string)($r['fullName'] ?? $r['volunteerId']), 'centre' => (string)($r['centre'] ?? ''),
              'earnedDays' => (int)$r['earnedDays'], 'excludedDays' => (int)$r['excludedDays'], 'amount' => (int)$r['amount'], 'unpaid' => (int)$r['unpaid'],
              'state' => (int)$r['unpaid'] > 0 ? 'unpaid' : ((int)$r['amount'] > 0 ? 'paid' : 'nothing')];
        $out[] = $o;
        $tot['earned'] += $o['amount']; $tot['unpaid'] += $o['unpaid']; $tot['people']++; $tot['daysEarned'] += $o['earnedDays']; $tot['daysExcluded'] += $o['excludedDays'];
    }
    return ['ok' => true, 'period' => $key, 'label' => $span[2] ?? $key, 'start' => $span[0] ?? '', 'end' => $span[1] ?? '',
            'ended' => $span !== null && $span[1] < date('Y-m-d'), 'current' => $key === $cur,
            'periods' => array_map(static fn($k) => [$k, (volpay_period_of_key($k) ?? [2 => $k])[2]], $keys),
            'rows' => $out, 'totals' => $tot, 'on' => !empty($cfg['enabled'])];
}

function admin_volpay_volunteer(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $v = volpay_volunteer_gate($g['requester'], (string)($p['volunteerId'] ?? ''));
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'volunteer' => ['volunteerId' => (string)$v['volunteerId'], 'name' => (string)$v['fullName'], 'centre' => (string)$v['centre'], 'status' => (string)$v['status']],
            'wallet' => volpay_wallet((string)$v['volunteerId'], true)];
}

/** Exclude one earned day by hand, or restore an excluded one — with the reason, and never once paid. */
function admin_volpay_day_set(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $v = volpay_volunteer_gate($g['requester'], (string)($p['volunteerId'] ?? ''));
    if (!$v) return ['ok' => false, 'error' => 'not_found'];
    $me = (string)$g['requester']['memberId'];
    if ((string)($v['memberId'] ?? '') !== '' && (string)$v['memberId'] === $me) return ['ok' => false, 'error' => 'own_account'];
    $op = (string)($p['op'] ?? ''); $why = trim(mb_substr((string)($p['reason'] ?? ''), 0, 300));
    if (!in_array($op, ['exclude', 'restore'], true)) return ['ok' => false, 'error' => 'bad_action'];
    if ($why === '') return ['ok' => false, 'error' => 'reason_required', 'message' => 'Say why. It is kept with the day, and the volunteer sees it.'];
    $r = db_row('SELECT * FROM volunteer_pay WHERE volunteerId = ? AND day = ? LIMIT 1', [(string)$v['volunteerId'], (string)($p['day'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$r['payoutId'] !== '') return ['ok' => false, 'error' => 'already_paid', 'message' => 'That day is paid. Void the payout first.'];
    if (($op === 'exclude') === ((string)$r['status'] === 'excluded')) return ['ok' => true, 'unchanged' => true, 'wallet' => volpay_wallet((string)$v['volunteerId'], true)];
    $rate = (int)$r['rate'] > 0 ? (int)$r['rate'] : (int)volpay_settings()['amount'];
    db_update('volunteer_pay', $op === 'exclude'
        ? ['status' => 'excluded', 'amount' => 0, 'reason' => 'admin', 'overrideBy' => $me, 'overrideReason' => $why, 'overrideAt' => now_iso()]
        : ['status' => 'earned', 'amount' => $rate, 'reason' => '', 'overrideBy' => $me, 'overrideReason' => $why, 'overrideAt' => now_iso()],
        ['id' => (int)$r['id']]);
    audit('volpay.day.' . $op, $me, 'volunteer:' . $v['volunteerId'], ['day' => $r['day'], 'was' => $r['status'], 'wasReason' => $r['reason'], 'why' => $why], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'wallet' => volpay_wallet((string)$v['volunteerId'], true)];
}

/**
 * Pay a period that has ended, for up to VOLPAY_PAY_MAX volunteers: each
 * one's earned, unpaid days of it, as one payout. Per-volunteer verdicts; one
 * audit event for the run.
 */
function admin_volpay_pay(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $me = (string)$g['requester']['memberId'];
    $key = (string)($p['period'] ?? ''); $span = volpay_period_of_key($key);
    if (!$span) return ['ok' => false, 'error' => 'bad_period'];
    if ($span[1] >= date('Y-m-d')) return ['ok' => false, 'error' => 'period_open', 'message' => 'This period runs until ' . $span[1] . '. It can be paid once it has ended.'];
    $method = (string)($p['method'] ?? ''); $ref = trim(mb_substr((string)($p['reference'] ?? ''), 0, 120));
    if (!isset(VOLPAY_METHODS[$method])) return ['ok' => false, 'error' => 'bad_method'];
    if ($method === 'transfer' && $ref === '') return ['ok' => false, 'error' => 'reference_required', 'message' => 'Give the transfer reference.'];
    $ids = array_values(array_unique(array_map('strval', (array)($p['volunteerIds'] ?? []))));
    if (!$ids) return ['ok' => false, 'error' => 'none'];
    if (count($ids) > VOLPAY_PAY_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'At most ' . VOLPAY_PAY_MAX . ' volunteers in one payment run.'];
    $results = []; $paidN = 0; $total = 0;
    foreach ($ids as $id) {
        $v = volpay_volunteer_gate($g['requester'], $id);
        if (!$v) { $results[] = ['volunteerId' => $id, 'state' => 'refused', 'error' => 'out_of_scope']; continue; }
        if ((string)($v['memberId'] ?? '') !== '' && (string)$v['memberId'] === $me) { $results[] = ['volunteerId' => $id, 'state' => 'refused', 'error' => 'own_account']; continue; }
        $rows = db_all("SELECT id, amount FROM volunteer_pay WHERE volunteerId = ? AND periodKey = ? AND status = 'earned' AND payoutId = ''", [$id, $key]);
        if (!$rows) { $results[] = ['volunteerId' => $id, 'state' => 'unchanged']; continue; }
        $amount = array_sum(array_map(static fn($r) => (int)$r['amount'], $rows));
        $pid = 'VP-' . strtoupper(bin2hex(random_bytes(5)));
        db_insert('volunteer_payouts', ['payoutId' => $pid, 'volunteerId' => $id, 'periodKey' => $key, 'amount' => $amount, 'days' => count($rows),
            'method' => $method, 'reference' => $ref, 'paidAt' => now_iso(), 'paidBy' => $me]);
        $in = implode(',', array_map(static fn($r) => (int)$r['id'], $rows));
        db_exec("UPDATE volunteer_pay SET payoutId = ? WHERE id IN ($in) AND payoutId = ''", [$pid]);
        $results[] = ['volunteerId' => $id, 'state' => 'applied', 'payoutId' => $pid, 'amount' => $amount, 'days' => count($rows)];
        $paidN++; $total += $amount;
    }
    $refused = array_values(array_filter($results, static fn($r) => $r['state'] === 'refused'));
    audit('volpay.pay', $me, 'period:' . $key, ['count' => count($ids), 'paid' => $paidN, 'total' => $total, 'method' => $method, 'refused' => count($refused)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ran' => count($ids), 'paid' => $paidN, 'total' => $total, 'partial' => (bool)$refused, 'results' => $results];
}

/** Undo a payout recorded by mistake: its days are unpaid again. */
function admin_volpay_payout_void(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $po = db_row('SELECT * FROM volunteer_payouts WHERE payoutId = ? LIMIT 1', [(string)($p['payoutId'] ?? '')]);
    if (!$po || !volpay_volunteer_gate($g['requester'], (string)$po['volunteerId'])) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$po['voidedAt'] !== '') return ['ok' => true, 'unchanged' => true];
    $why = trim(mb_substr((string)($p['reason'] ?? ''), 0, 300));
    if ($why === '') return ['ok' => false, 'error' => 'reason_required'];
    $me = (string)$g['requester']['memberId'];
    db_update('volunteer_payouts', ['voidedAt' => now_iso(), 'voidedBy' => $me, 'voidReason' => $why], ['payoutId' => (string)$po['payoutId']]);
    db_exec("UPDATE volunteer_pay SET payoutId = '' WHERE payoutId = ?", [(string)$po['payoutId']]);
    audit('volpay.payout.void', $me, 'volunteer:' . $po['volunteerId'], ['payoutId' => $po['payoutId'], 'amount' => (int)$po['amount'], 'why' => $why], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'wallet' => volpay_wallet((string)$po['volunteerId'], true)];
}

/* ── The volunteer's own wallet ───────────────────────────────────────────── */

/** member.volpay: the wallet of the volunteer this member is, or nothing when they are not one. */
function member_volpay(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    if ($mid === '') return ['ok' => false, 'error' => 'not_found'];
    $v = db_row('SELECT volunteerId, fullName, status FROM volunteers WHERE memberId = ? ORDER BY status = \'active\' DESC LIMIT 1', [$mid]);
    if (!$v) {
        $m = db_row('SELECT ngvVolunteerId FROM members WHERE memberId = ? LIMIT 1', [$mid]);
        $vid = (string)($m['ngvVolunteerId'] ?? '');
        $v = $vid !== '' ? db_row('SELECT volunteerId, fullName, status FROM volunteers WHERE volunteerId = ? LIMIT 1', [$vid]) : null;
    }
    if (!$v) return ['ok' => true, 'wallet' => null];
    return ['ok' => true, 'wallet' => volpay_wallet((string)$v['volunteerId'], false) + ['volunteerId' => (string)$v['volunteerId'], 'active' => (string)$v['status'] === 'active']];
}
