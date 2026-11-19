<?php
declare(strict_types=1);

/**
 * Instalment plans — paying what is owed in 2 to 6 parts (schema 240).
 *
 * How one comes to exist:
 *   • A parent sets one up in the family app (Fees → Set up a payment plan):
 *     picks the number of instalments and how often, sees the exact dates and
 *     amounts (worked out HERE — fee_plan_schedule — never on the page), reads
 *     the terms, types their name and ticks to agree.
 *   • Staff set one up for a parent who agreed by phone, in person or in
 *     writing, and must say which (`agreedVia`). A staff plan carries no typed
 *     signature, so the channel is the record of how the family agreed.
 *   Either way the plan is PENDING until somebody holding `fees` approves it.
 *   A request is not a promise: until it is approved nothing on the account
 *   changes and the family is told it is waiting.
 *
 * What counts towards it: ANY payment — online, transfer or cash at the desk —
 * made after the plan was set up. There is no separate "plan payment": the desk
 * records money exactly as it does now, and the plan reads the ledger. Payments
 * fill the instalments oldest first. The plan's total is the amount owed on the
 * day it was set up, fixed; dues that fall due during the plan are charged as
 * normal and are NOT part of it.
 *
 * The longest a plan may run is the admin's setting `planMaxDays` (fees
 * settings), measured from the first instalment to the last. The server refuses
 * a schedule past it whatever the page offered.
 */

const FEE_PLAN_COUNT_MIN = 2;
const FEE_PLAN_COUNT_MAX = 6;
/** Days between instalments. Monthly is calendar months, not 30 days — see fee_plan_dates(). */
const FEE_PLAN_CADENCES = ['weekly' => 'Every week', 'fortnightly' => 'Every two weeks', 'monthly' => 'Every month'];
const FEE_PLAN_AGREED_VIA = ['app' => 'In the family app', 'phone' => 'By phone', 'in_person' => 'In person', 'writing' => 'In writing'];
const FEE_PLAN_STATUSES = ['pending', 'active', 'declined', 'completed', 'cancelled'];
const FEE_PLAN_MAX_DAYS_MIN = 14;
const FEE_PLAN_MAX_DAYS_MAX = 365;
const FEE_PLAN_MAX_DAYS_DEFAULT = 120;
/** Bump when the wording below changes: each plan stores the version it was agreed under. */
const FEE_PLAN_TERMS_VERSION = '2026-11-19';

function fee_plan_max_days(?array $cfg = null): int {
    $cfg = $cfg ?? fees_settings();
    $d = (int)($cfg['planMaxDays'] ?? FEE_PLAN_MAX_DAYS_DEFAULT);
    return max(FEE_PLAN_MAX_DAYS_MIN, min(FEE_PLAN_MAX_DAYS_MAX, $d ?: FEE_PLAN_MAX_DAYS_DEFAULT));
}

/** The terms a family agrees to, in words. Built from the settings so it cannot promise a limit that is not enforced. */
function fee_plan_terms(?array $cfg = null): array {
    $max = fee_plan_max_days($cfg);
    return ['version' => FEE_PLAN_TERMS_VERSION, 'lines' => [
        'The plan covers what is owed today. It starts only once NGG approves it.',
        'Each instalment is due on the date shown. Any payment counts towards the plan — online, by bank transfer or cash at the desk.',
        'Payments go to the earliest instalment first. Paying early or paying more is always fine.',
        'New monthly fees that fall due during the plan are charged as normal and are not part of the plan.',
        'A plan can run for at most ' . $max . ' days from the first instalment to the last.',
        'If an instalment is missed, NGG will contact you. NGG may cancel the plan, and the amount still owed is then due as normal.',
    ]];
}

/** Instalment dates from a start date. Monthly keeps the day of the month, clamped to the month's end (31 Jan → 28/29 Feb). */
function fee_plan_dates(string $start, int $count, string $cadence): array {
    $out = [];
    $t = strtotime($start . 'T12:00:00Z');
    [$y, $m, $d] = array_map('intval', explode('-', gmdate('Y-m-d', $t)));
    for ($i = 0; $i < $count; $i++) {
        if ($cadence === 'monthly') {
            $mm = $m - 1 + $i; $yy = $y + intdiv($mm, 12); $mm = $mm % 12 + 1;
            $last = (int)gmdate('t', gmmktime(12, 0, 0, $mm, 1, $yy));
            $out[] = sprintf('%04d-%02d-%02d', $yy, $mm, min($d, $last));
        } else {
            $out[] = gmdate('Y-m-d', $t + $i * ($cadence === 'weekly' ? 7 : 14) * 86400);
        }
    }
    return $out;
}

/**
 * The schedule for a total: equal parts in whole naira, the remainder on the
 * LAST instalment so the first is never the odd one. Returns
 * ['ok' => true, 'schedule' => [[n, date, amount]...], 'spanDays' => N] or
 * ['ok' => false, 'error' => …].
 */
function fee_plan_schedule(int $total, int $count, string $cadence, string $start, ?array $cfg = null): array {
    if ($total <= 0) return ['ok' => false, 'error' => 'nothing_owed'];
    if ($count < FEE_PLAN_COUNT_MIN || $count > FEE_PLAN_COUNT_MAX) return ['ok' => false, 'error' => 'bad_count'];
    if (!isset(FEE_PLAN_CADENCES[$cadence])) return ['ok' => false, 'error' => 'bad_cadence'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) return ['ok' => false, 'error' => 'bad_start'];
    if ($total < $count) return ['ok' => false, 'error' => 'too_small'];
    $dates = fee_plan_dates($start, $count, $cadence);
    $span = (int)round((strtotime($dates[$count - 1] . 'T12:00:00Z') - strtotime($dates[0] . 'T12:00:00Z')) / 86400);
    $max = fee_plan_max_days($cfg);
    if ($span > $max) return ['ok' => false, 'error' => 'too_long', 'maxDays' => $max, 'spanDays' => $span];
    $each = intdiv($total, $count);
    $rows = [];
    foreach ($dates as $i => $d) $rows[] = ['n' => $i + 1, 'date' => $d, 'amount' => $i === $count - 1 ? $total - $each * ($count - 1) : $each];
    return ['ok' => true, 'schedule' => $rows, 'spanDays' => $span, 'maxDays' => $max];
}

/** The member's plan that is still in play (pending or active), if any. */
function fee_plan_open(string $memberId): ?array {
    return db_row("SELECT * FROM fee_plans WHERE memberId = ? AND status IN ('pending','active') ORDER BY id DESC LIMIT 1", [$memberId]) ?: null;
}

/** What the family owes today — the plan's total. The figure the Fees page calls "payable". */
function fee_plan_owed(array $m): int {
    $b = fees_balance($m);
    return max(0, (int)($b['payable'] ?? 0));
}

/**
 * Where a plan stands, read from the ledger: every live `payment` credit made
 * after the plan was set up counts, oldest instalment first, capped at the
 * plan's total. An instalment is paid, part-paid, due or overdue; the plan is
 * completed when the payments reach the total (recorded here, on read, so no
 * cron is needed to notice).
 */
function fee_plan_view(array $plan, ?string $today = null): array {
    $today = $today ?? (function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'));
    $total = (int)$plan['total'];
    $paid = 0;
    foreach (db_all("SELECT amount, voidedAt FROM member_ledger WHERE memberId = ? AND kind = 'payment' AND createdAt >= ?",
                    [(string)$plan['memberId'], (string)$plan['createdAt']]) as $r) {
        if (trim((string)($r['voidedAt'] ?? '')) === '') $paid += (int)$r['amount'];
    }
    $counted = min($paid, $total);
    $left = $counted; $rows = []; $overdue = 0; $nextDue = null;
    foreach ((array)json_decode((string)$plan['scheduleJson'], true) as $it) {
        $amt = (int)$it['amount'];
        $got = min($amt, $left); $left -= $got;
        $state = $got >= $amt ? 'paid' : ((string)$it['date'] < $today ? 'overdue' : ($got > 0 ? 'part' : 'due'));
        if ($state === 'overdue') $overdue += $amt - $got;
        if ($state !== 'paid' && $nextDue === null) $nextDue = ['date' => (string)$it['date'], 'amount' => $amt - $got];
        $rows[] = ['n' => (int)$it['n'], 'date' => (string)$it['date'], 'amount' => $amt, 'paid' => $got, 'state' => $state];
    }
    $status = (string)$plan['status'];
    if ($status === 'active' && $counted >= $total) {
        db_exec("UPDATE fee_plans SET status = 'completed', completedAt = ?, updatedAt = ? WHERE planId = ? AND status = 'active'",
            [now_iso(), now_iso(), (string)$plan['planId']]);
        audit('fees.plan.completed', 'system', (string)$plan['memberId'], ['planId' => (string)$plan['planId']]);
        $status = 'completed';
    }
    return [
        'planId' => (string)$plan['planId'], 'status' => $status, 'total' => $total, 'paid' => $counted, 'left' => $total - $counted,
        'overdue' => $overdue, 'next' => $nextDue, 'count' => (int)$plan['count'], 'cadence' => (string)$plan['cadence'],
        'cadenceLabel' => FEE_PLAN_CADENCES[(string)$plan['cadence']] ?? '', 'schedule' => $rows,
        'source' => (string)$plan['source'], 'agreedVia' => (string)$plan['agreedVia'],
        'agreedViaLabel' => FEE_PLAN_AGREED_VIA[(string)$plan['agreedVia']] ?? '', 'signedName' => (string)$plan['signedName'],
        'createdAt' => (string)$plan['createdAt'], 'decidedAt' => (string)$plan['decidedAt'], 'declineReason' => (string)$plan['declineReason'],
        'cancelReason' => (string)$plan['cancelReason'],
    ];
}

/**
 * Set up a plan (pending). The ONE writer for both doors:
 *   $who = ['source' => 'family', 'by' => 'guardian:G…', 'guardianId' => …, 'signedName' => …, 'agreed' => true]
 *   $who = ['source' => 'staff',  'by' => staffMemberId, 'agreedVia' => phone|in_person|writing, 'note' => …]
 */
function fee_plan_create(array $m, int $count, string $cadence, string $start, array $who): array {
    $mid = (string)$m['memberId'];
    if (fee_plan_open($mid)) return ['ok' => false, 'error' => 'plan_exists'];
    $cfg = fees_settings();
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    if ($start === '') $start = $today;
    if ($start < $today) return ['ok' => false, 'error' => 'start_in_past'];
    $source = ($who['source'] ?? '') === 'staff' ? 'staff' : 'family';
    if ($source === 'family') {
        $name = trim((string)($who['signedName'] ?? ''));
        if (mb_strlen($name) < 3) return ['ok' => false, 'error' => 'name_required'];
        if (empty($who['agreed'])) return ['ok' => false, 'error' => 'terms_not_agreed'];
        $via = 'app';
    } else {
        $via = (string)($who['agreedVia'] ?? '');
        if (!in_array($via, ['phone', 'in_person', 'writing'], true)) return ['ok' => false, 'error' => 'agreed_via_required'];
        $name = trim((string)($who['signedName'] ?? ''));
    }
    // Who agreed is checked first: there is no point working out dates for a plan nobody has agreed to.
    $total = fee_plan_owed($m);
    $s = fee_plan_schedule($total, $count, $cadence, $start, $cfg);
    if (!$s['ok']) return $s;
    $row = [
        'planId' => 'PLN-' . strtoupper(bin2hex(random_bytes(5))), 'memberId' => $mid,
        'guardianId' => (string)($who['guardianId'] ?? ''), 'source' => $source, 'agreedVia' => $via,
        'signedName' => mb_substr($name, 0, 160), 'termsVersion' => FEE_PLAN_TERMS_VERSION,
        'note' => mb_substr(trim((string)($who['note'] ?? '')), 0, 400),
        'count' => $count, 'cadence' => $cadence, 'startDate' => $start, 'total' => $total,
        'scheduleJson' => json_encode($s['schedule']), 'status' => 'pending',
        'createdBy' => (string)($who['by'] ?? ''), 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
        'decidedBy' => '', 'decidedAt' => '', 'declineReason' => '', 'cancelReason' => '', 'completedAt' => '',
    ];
    db_insert('fee_plans', $row);
    audit('fees.plan.create', (string)$row['createdBy'], $mid, ['planId' => $row['planId'], 'source' => $source, 'agreedVia' => $via,
        'total' => $total, 'count' => $count, 'cadence' => $cadence], '');
    return ['ok' => true, 'plan' => fee_plan_view($row)];
}

/** Tell every guardian linked to the member, in the family app's notices. Best-effort: a decision stands whether or not it is delivered. */
function fee_plan_tell(string $memberId, string $planId, string $title, string $body): void {
    if (!function_exists('family_notice_add')) return;
    foreach (db_all("SELECT guardianId FROM guardian_wards WHERE memberId = ? AND status = 'active'", [$memberId]) as $g) {
        try { family_notice_add((string)$g['guardianId'], 'fees', $planId, $title, $body, 'NGG'); } catch (Throwable $e) { error_log('[fee_plan_tell] ' . $e->getMessage()); }
    }
}

/* ── Ops ─────────────────────────────────────────────────────────────────── */

/** family.fees.plan.preview — the dates and amounts, worked out by the server, before anything is saved. */
function family_fees_plan_preview(array $p): array {
    $l = function_exists('family_link') ? family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? '')) : null;
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    $s = fee_plan_schedule(fee_plan_owed($m), (int)($p['count'] ?? 0), (string)($p['cadence'] ?? ''), $today);
    return $s + ['terms' => fee_plan_terms()];
}

/** family.fees.plan.create — a parent asks for a plan. Pending until NGG approves it. */
function family_fees_plan_create(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $l = function_exists('family_link') ? family_link($gid, (string)($p['linkId'] ?? '')) : null;
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return fee_plan_create($m, (int)($p['count'] ?? 0), (string)($p['cadence'] ?? ''), '',
        ['source' => 'family', 'by' => 'guardian:' . $gid, 'guardianId' => $gid,
         'signedName' => (string)($p['signedName'] ?? ''), 'agreed' => ($p['agreed'] ?? false) === true]);
}

/** admin.fees.plan.create — staff set up a plan a parent agreed to off the app, and say how they agreed. */
function admin_fees_plan_create(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return fee_plan_create($m, (int)($p['count'] ?? 0), (string)($p['cadence'] ?? ''), (string)($p['startDate'] ?? ''),
        ['source' => 'staff', 'by' => (string)($g['requester']['memberId'] ?? ''), 'agreedVia' => (string)($p['agreedVia'] ?? ''),
         'signedName' => (string)($p['parentName'] ?? ''), 'note' => (string)($p['note'] ?? '')]);
}

/** admin.fees.plan.preview — the same schedule staff will be creating, before they create it. */
function admin_fees_plan_preview(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    $start = (string)($p['startDate'] ?? '') ?: $today;
    return fee_plan_schedule(fee_plan_owed($m), (int)($p['count'] ?? 0), (string)($p['cadence'] ?? ''), $start) + ['terms' => fee_plan_terms()];
}

/** admin.fees.plans — plans waiting for a decision, and those running. Scoped to the requester's centres. */
function admin_fees_plans(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? 'open');
    $where = $status === 'all' ? "1=1" : ($status === 'pending' ? "p.status = 'pending'" : "p.status IN ('pending','active')");
    $rows = db_all("SELECT p.*, m.fullName, m.centre FROM fee_plans p LEFT JOIN members m ON m.memberId = p.memberId
                     WHERE $where ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC LIMIT 300");
    $out = [];
    foreach ($rows as $r) {
        if (!fees_scope_gate($g['requester'], (string)$r['memberId'])['ok']) continue;
        $out[] = fee_plan_view($r) + ['memberId' => (string)$r['memberId'], 'name' => (string)($r['fullName'] ?? ''), 'centre' => (string)($r['centre'] ?? '')];
    }
    return ['ok' => true, 'plans' => $out, 'maxDays' => fee_plan_max_days()];
}

/** admin.fees.plan.decide — approve, or decline with a reason the family is told. */
function admin_fees_plan_decide(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $plan = db_row('SELECT * FROM fee_plans WHERE planId = ? LIMIT 1', [(string)($p['planId'] ?? '')]);
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    $sg = fees_scope_gate($g['requester'], (string)$plan['memberId']); if (!$sg['ok']) return $sg;
    if ((string)$plan['status'] !== 'pending') return ['ok' => false, 'error' => 'not_pending'];
    $by = (string)($g['requester']['memberId'] ?? '');
    $approve = ($p['decision'] ?? '') === 'approve';
    $reason = trim((string)($p['reason'] ?? ''));
    if (!$approve && $reason === '') return ['ok' => false, 'error' => 'reason_required'];
    /* Compare-and-set on the status: two people pressing at once decide it once. */
    $n = db_exec("UPDATE fee_plans SET status = ?, decidedBy = ?, decidedAt = ?, declineReason = ?, updatedAt = ? WHERE planId = ? AND status = 'pending'",
        [$approve ? 'active' : 'declined', $by, now_iso(), $approve ? '' : mb_substr($reason, 0, 400), now_iso(), (string)$plan['planId']]);
    if (!$n) return ['ok' => false, 'error' => 'not_pending'];
    audit($approve ? 'fees.plan.approve' : 'fees.plan.decline', $by, (string)$plan['memberId'], ['planId' => (string)$plan['planId'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    $cfg = fees_settings();
    fee_plan_tell((string)$plan['memberId'], (string)$plan['planId'],
        $approve ? 'Your payment plan is approved' : 'Your payment plan was not approved',
        $approve ? 'The plan for ' . fees_money_text((int)$plan['total'], $cfg) . ' is now running. The dates are on the Fees page.'
                 : $reason . ' The full amount is due as normal; you can ask for a different plan from the Fees page.');
    return ['ok' => true, 'plan' => fee_plan_view(db_row('SELECT * FROM fee_plans WHERE planId = ?', [(string)$plan['planId']]))];
}

/** admin.fees.plan.cancel — end a pending or running plan, with a reason. What is still owed is then due as normal. */
function admin_fees_plan_cancel(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $plan = db_row('SELECT * FROM fee_plans WHERE planId = ? LIMIT 1', [(string)($p['planId'] ?? '')]);
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    $sg = fees_scope_gate($g['requester'], (string)$plan['memberId']); if (!$sg['ok']) return $sg;
    $reason = trim((string)($p['reason'] ?? ''));
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $by = (string)($g['requester']['memberId'] ?? '');
    $n = db_exec("UPDATE fee_plans SET status = 'cancelled', cancelReason = ?, decidedBy = ?, updatedAt = ? WHERE planId = ? AND status IN ('pending','active')",
        [mb_substr($reason, 0, 400), $by, now_iso(), (string)$plan['planId']]);
    if (!$n) return ['ok' => false, 'error' => 'not_open'];
    audit('fees.plan.cancel', $by, (string)$plan['memberId'], ['planId' => (string)$plan['planId'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    fee_plan_tell((string)$plan['memberId'], (string)$plan['planId'], 'Your payment plan has ended',
        $reason . ' What is still owed is now due as normal.');
    return ['ok' => true];
}

/** What the family's Fees page shows about plans: the plan in play (or the last decision), and whether one may be asked for. */
function family_fee_plan_block(array $m, int $payable): array {
    $mid = (string)$m['memberId'];
    $open = fee_plan_open($mid);
    $last = $open ?: (db_row("SELECT * FROM fee_plans WHERE memberId = ? ORDER BY id DESC LIMIT 1", [$mid]) ?: null);
    $view = $last ? fee_plan_view($last) : null;
    $live = $view && in_array($view['status'], ['pending', 'active'], true);
    return [
        'plan' => $view,
        'offer' => !$live && $payable >= FEE_PLAN_COUNT_MIN ? [
            'payable' => $payable, 'counts' => range(FEE_PLAN_COUNT_MIN, FEE_PLAN_COUNT_MAX),
            'cadences' => array_map(static fn($k, $v) => ['key' => $k, 'label' => $v], array_keys(FEE_PLAN_CADENCES), FEE_PLAN_CADENCES),
            'maxDays' => fee_plan_max_days(), 'terms' => fee_plan_terms(),
        ] : null,
    ];
}
