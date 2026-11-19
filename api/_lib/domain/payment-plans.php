<?php
declare(strict_types=1);
/* ═══════════════════════════════════════════════════════════════════════════
   INSTALMENT PLANS — an agreed schedule for clearing a balance, and the record
   of whether it was kept

   An instalment (membership_part_invoice) lets a family pay what it can. A PLAN
   is the promise around it: "₦24,000 in four monthly instalments of ₦6,000,
   the first on 1 December", agreed by a named person on a stated day to stated
   terms, and then tracked — what was due, what came in, what is late, who was
   told and when, and who changed or ended it and why.

   ONE TRUTH FOR MONEY. A plan stores what was agreed, never what was paid.
   Progress is read from the ledger every time: the payments posted to the
   account since the plan began (`startPaid` is the total of payments when it
   was agreed), however they came — online, by transfer, cash at the desk. The
   ledger is a pool that pays the oldest charges first (fees_charges_left), so
   a plan does not earmark money; it watches the balance come down. And it
   never asks for more than is owed: a waiver or write-off that cuts the
   balance shortens what is left on the plan too.

     remaining  = min(total − paid since the start, what is payable today)
     covered    = total − remaining, laid over the instalments in order

   Each instalment is then `paid`, `part` (some of it), `due` (not yet), or
   `late` (its day has passed and it is not covered). The plan's HEALTH:
     on_track   nothing late
     behind     something late, for up to PLAN_GRACE_DAYS
     broken     an instalment more than PLAN_GRACE_DAYS late
     completed  nothing left (recorded once, with the day)
     cancelled  ended by staff, with a reason (recorded)

   ACCOUNTABILITY is payment_plan_events: created (who, the terms, the
   schedule), each reminder sent, each instalment missed and each paid (once
   each, by the nightly job), completed, cancelled (who and why), and staff
   notes. Every write is also in the audit log.

   FOLLOW-UPS (plan_reminders_run, from dues_notices_run every day):
     plan_due     PLAN_REMIND_BEFORE_DAYS before an instalment falls due
     plan_late    the day after, if it is not covered
     plan_broken  once, when the plan passes the grace period — to the family;
                  the Control Room lists it for staff
   A family on a plan that is on track or behind is not sent the general
   arrears reminder as well (fees_reminder_candidates: `onPlan`): the plan's
   own reminders replace it. A broken plan stops protecting them.
   ═══════════════════════════════════════════════════════════════════════════ */

const PLAN_MIN_COUNT = 2;
const PLAN_MAX_COUNT = 6;
/** Days between instalments; 'monthly' steps by calendar month. */
const PLAN_FREQUENCIES = ['weekly' => 7, 'fortnightly' => 14, 'monthly' => 0];
const PLAN_FREQ_LABEL = ['weekly' => 'every week', 'fortnightly' => 'every two weeks', 'monthly' => 'every month'];
/** The last instalment falls at most this many days after the first. */
const PLAN_MAX_SPAN_DAYS = 183;
/** The first instalment falls within this many days of agreeing. */
const PLAN_FIRST_DUE_MAX_DAYS = 31;
const PLAN_GRACE_DAYS = 14;
const PLAN_REMIND_BEFORE_DAYS = 3;
const PLAN_LIST_MAX = 100;
const PLAN_TERMS_VERSION = '2026-11';
const PLAN_TERMS = 'I agree to pay the balance shown in the instalments shown, on or before each date. '
    . 'Any payment to the account counts towards the plan, however it is made. New dues that fall due while the plan runs are '
    . 'charged as usual and are not part of it. If an instalment is more than ' . PLAN_GRACE_DAYS . ' days late the plan ends, '
    . 'and the whole balance is owed as normal. NGG staff can see this plan and its record.';

/* ── Reading ───────────────────────────────────────────────────────────── */

function plan_today(): string {
    return function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
}

/** Payments posted to the account, live ones only. */
function plan_payments_total(string $mid): int {
    $r = db_row("SELECT COALESCE(SUM(amount), 0) s FROM member_ledger WHERE memberId = ? AND kind = 'payment' AND direction = 'credit' AND COALESCE(voidedAt, '') = ''", [$mid]);
    return (int)($r['s'] ?? 0);
}

function plan_active_for(string $mid): ?array {
    return db_row("SELECT * FROM payment_plans WHERE memberId = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [$mid]) ?: null;
}

function plan_items(string $planId): array {
    return db_all('SELECT seq, dueDate, amount FROM payment_plan_items WHERE planId = ? ORDER BY seq', [$planId]);
}

function plan_days_between(string $a, string $b): int {
    return (int)round((strtotime($b . 'T00:00:00Z') - strtotime($a . 'T00:00:00Z')) / 86400);
}

/** The dates of $count instalments from $first. A monthly date keeps its day, or the month's last day. */
function plan_dates(string $first, int $count, string $freq): array {
    $out = [];
    [$y, $mo, $d] = array_map('intval', explode('-', $first));
    for ($i = 0; $i < $count; $i++) {
        if (PLAN_FREQUENCIES[$freq] > 0) { $out[] = gmdate('Y-m-d', strtotime($first . 'T00:00:00Z') + $i * PLAN_FREQUENCIES[$freq] * 86400); continue; }
        $mm = $mo + $i; $yy = $y + intdiv($mm - 1, 12); $mm = ($mm - 1) % 12 + 1;
        $out[] = sprintf('%04d-%02d-%02d', $yy, $mm, min($d, (int)gmdate('t', gmmktime(0, 0, 0, $mm, 1, $yy))));
    }
    return $out;
}

/**
 * The schedule for a balance, or the reason it cannot be one. Equal amounts in
 * whole naira; the remainder goes on the FIRST, so the family is never surprised
 * by a larger last payment.
 */
function plan_schedule(int $total, int $count, string $freq, string $first, ?string $today = null): array {
    $today = $today ?? plan_today();
    if (!isset(PLAN_FREQUENCIES[$freq])) return ['ok' => false, 'error' => 'bad_frequency', 'detail' => 'Choose weekly, every two weeks or monthly.'];
    if ($count < PLAN_MIN_COUNT || $count > PLAN_MAX_COUNT) return ['ok' => false, 'error' => 'bad_count', 'detail' => 'A plan has from ' . PLAN_MIN_COUNT . ' to ' . PLAN_MAX_COUNT . ' instalments.'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $first) || !checkdate((int)substr($first, 5, 2), (int)substr($first, 8, 2), (int)substr($first, 0, 4)))
        return ['ok' => false, 'error' => 'bad_date', 'detail' => 'Choose the day of the first instalment.'];
    if ($first < $today) return ['ok' => false, 'error' => 'date_past', 'detail' => 'The first instalment can’t be in the past.'];
    if (plan_days_between($today, $first) > PLAN_FIRST_DUE_MAX_DAYS) return ['ok' => false, 'error' => 'date_too_far', 'detail' => 'The first instalment must fall within ' . PLAN_FIRST_DUE_MAX_DAYS . ' days.'];
    $min = defined('MPAY_PART_MIN') ? MPAY_PART_MIN : 1000;
    if ($total < $count * $min) return ['ok' => false, 'error' => 'too_small', 'detail' => 'Each instalment must be at least ' . fees_money_text($min) . '. Choose fewer instalments.'];
    $dates = plan_dates($first, $count, $freq);
    if (plan_days_between($dates[0], end($dates)) > PLAN_MAX_SPAN_DAYS) return ['ok' => false, 'error' => 'too_long', 'detail' => 'A plan can run for at most six months. Choose fewer or more frequent instalments.'];
    $each = intdiv($total, $count);
    $items = [];
    foreach ($dates as $i => $dt) $items[] = ['seq' => $i + 1, 'dueDate' => $dt, 'amount' => $each + ($i === 0 ? $total - $each * $count : 0)];
    return ['ok' => true, 'total' => $total, 'instalments' => $count, 'frequency' => $freq, 'items' => $items];
}

/**
 * Where a plan stands today — from the ledger, never stored. `payNow` is what
 * would bring it up to date (everything overdue), else the next instalment.
 */
function plan_state(array $plan, ?array $m = null, ?string $today = null, ?int $payable = null, ?array $entries = null, ?array $items = null): array {
    $today = $today ?? plan_today();
    $mid = (string)$plan['memberId'];
    $m = $m ?? (db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]) ?: []);
    $items = $items ?? plan_items((string)$plan['planId']);
    $total = (int)$plan['total'];
    $paid = $entries === null ? plan_payments_total($mid) : array_sum(array_map(static fn($e) => (string)$e['kind'] === 'payment' && (string)$e['direction'] === 'credit' && trim((string)($e['voidedAt'] ?? '')) === '' ? (int)$e['amount'] : 0, $entries));
    $paidSince = max(0, $paid - (int)$plan['startPaid']);
    $payable = $payable ?? ($m && function_exists('fees_balance') ? (int)(fees_balance($m, null, null, $entries)['payable'] ?? 0) : 0);
    $remaining = max(0, min($total - $paidSince, $payable));
    $covered = $total - $remaining;
    $cum = 0; $out = []; $late = 0; $worst = 0; $overdue = 0; $next = null;
    foreach ($items as $it) {
        $amt = (int)$it['amount'];
        $got = max(0, min($amt, $covered - $cum)); $cum += $amt;
        $left = $amt - $got;
        $daysLate = $left > 0 && (string)$it['dueDate'] < $today ? plan_days_between((string)$it['dueDate'], $today) : 0;
        $st = $left === 0 ? 'paid' : ($daysLate > 0 ? 'late' : ($got > 0 ? 'part' : 'due'));
        if ($st === 'late') { $late++; $worst = max($worst, $daysLate); $overdue += $left; }
        if ($left > 0 && $next === null) $next = ['seq' => (int)$it['seq'], 'dueDate' => (string)$it['dueDate'], 'left' => $left];
        $out[] = ['seq' => (int)$it['seq'], 'dueDate' => (string)$it['dueDate'], 'amount' => $amt, 'paid' => $got, 'left' => $left, 'status' => $st, 'daysLate' => $daysLate];
    }
    $status = (string)$plan['status'];
    $health = $status === 'cancelled' ? 'cancelled' : ($status === 'completed' || $remaining === 0 ? 'completed'
        : ($worst > PLAN_GRACE_DAYS ? 'broken' : ($late > 0 ? 'behind' : 'on_track')));
    $payNow = $remaining > 0 ? min($remaining, $overdue > 0 ? $overdue : (int)($next['left'] ?? 0)) : 0;
    return ['planId' => (string)$plan['planId'], 'memberId' => $mid, 'status' => $status, 'health' => $health,
        'total' => $total, 'paid' => $covered, 'remaining' => $remaining, 'overdue' => $overdue, 'lateCount' => $late, 'daysLate' => $worst,
        'payNow' => $payNow, 'next' => $next, 'graceDays' => PLAN_GRACE_DAYS, 'items' => $out, 'frequency' => (string)$plan['frequency'], 'instalments' => (int)$plan['instalments'],
        'agreedBy' => (string)$plan['agreedBy'], 'agreedAt' => (string)$plan['agreedAt'], 'source' => (string)$plan['source'],
        'createdAt' => (string)$plan['createdAt'], 'completedAt' => (string)$plan['completedAt'],
        'cancelledAt' => (string)$plan['cancelledAt'], 'cancelReason' => (string)$plan['cancelReason'], 'note' => (string)$plan['note']];
}

/**
 * Plans with their states, read in a fixed number of queries whatever their
 * number: the members, their ledgers and the instalments each in one grouped
 * read (CLAUDE.md §6: no query per row in a list).
 */
function plan_states_batch(array $plans, ?string $today = null): array {
    if (!$plans) return [];
    $mids = array_values(array_unique(array_map(static fn($r) => (string)$r['memberId'], $plans)));
    $pids = array_map(static fn($r) => (string)$r['planId'], $plans);
    $members = []; $entries = []; $items = [];
    foreach (array_chunk($mids, 400) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT * FROM members WHERE memberId IN ($in)", $chunk) as $r) $members[(string)$r['memberId']] = $r;
        foreach (db_all("SELECT * FROM member_ledger WHERE memberId IN ($in) ORDER BY id", $chunk) as $e) $entries[(string)$e['memberId']][] = $e;
    }
    foreach (array_chunk($pids, 400) as $chunk) {
        $in = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT planId, seq, dueDate, amount FROM payment_plan_items WHERE planId IN ($in) ORDER BY planId, seq", $chunk) as $it) $items[(string)$it['planId']][] = $it;
    }
    $out = [];
    foreach ($plans as $plan) {
        $mid = (string)$plan['memberId'];
        $out[(string)$plan['planId']] = plan_state($plan, $members[$mid] ?? [], $today, null, $entries[$mid] ?? [], $items[(string)$plan['planId']] ?? []);
    }
    return $out;
}

function plan_event(string $planId, string $mid, string $kind, int $seq, string $actor, string $detail = '', int $amount = 0): void {
    db_insert('payment_plan_events', ['planId' => $planId, 'memberId' => $mid, 'kind' => $kind, 'seq' => $seq,
        'actor' => mb_substr($actor, 0, 160), 'detail' => mb_substr($detail, 0, 600), 'amount' => $amount, 'at' => now_iso()]);
}

function plan_event_once(string $planId, string $mid, string $kind, int $seq, string $actor, string $detail = '', int $amount = 0): bool {
    if (db_row('SELECT id FROM payment_plan_events WHERE planId = ? AND kind = ? AND seq = ? LIMIT 1', [$planId, $kind, $seq])) return false;
    plan_event($planId, $mid, $kind, $seq, $actor, $detail, $amount);
    return true;
}

/**
 * Write down what the ledger now says: each instalment paid or missed (once),
 * and the plan completed. Called by the nightly job and whenever a plan is
 * opened, so the record is never more than a day behind the money.
 */
function plan_sync(array $plan, ?array $state = null): array {
    $s = $state ?? plan_state($plan);
    if ((string)$plan['status'] !== 'active') return $s;
    $pid = (string)$plan['planId']; $mid = (string)$plan['memberId'];
    foreach ($s['items'] as $it) {
        if ($it['status'] === 'paid') plan_event_once($pid, $mid, 'paid', $it['seq'], 'system', 'Instalment ' . $it['seq'] . ' covered', $it['amount']);
        elseif ($it['status'] === 'late') plan_event_once($pid, $mid, 'missed', $it['seq'], 'system', 'Instalment ' . $it['seq'] . ' not paid by ' . $it['dueDate'], $it['left']);
    }
    if ($s['remaining'] === 0) {
        db_exec("UPDATE payment_plans SET status = 'completed', completedAt = ?, updatedAt = ? WHERE planId = ? AND status = 'active'", [now_iso(), now_iso(), $pid]);
        plan_event_once($pid, $mid, 'completed', 0, 'system', 'Nothing left to pay on the plan', $s['total']);
        audit('plan.completed', 'system', $mid, ['planId' => $pid, 'total' => $s['total']]);
        $s['status'] = 'completed'; $s['health'] = 'completed';
    } elseif ($s['health'] === 'broken') {
        plan_event_once($pid, $mid, 'broken', 0, 'system', 'An instalment is more than ' . PLAN_GRACE_DAYS . ' days late', $s['overdue']);
    }
    return $s;
}

function plan_events(string $planId): array {
    return array_map(static fn($e) => ['kind' => (string)$e['kind'], 'seq' => (int)$e['seq'], 'actor' => (string)$e['actor'], 'detail' => (string)$e['detail'],
        'amount' => (int)$e['amount'], 'at' => (string)$e['at']], db_all('SELECT * FROM payment_plan_events WHERE planId = ? ORDER BY id DESC LIMIT 200', [$planId]));
}

/* ── Making and ending ─────────────────────────────────────────────────── */

/**
 * Create a plan for the member's whole balance today. One active plan at a
 * time; the family's open payment links are left alone (they are payments).
 * $agreed: ['by' => name of the person who agreed, 'actor' => who pressed it,
 * 'source' => family|staff, 'note' => staff's note, 'how' => how a staff-made
 * plan was agreed (phone, in person, in writing)].
 */
function plan_create(array $m, int $count, string $freq, string $first, array $agreed): array {
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg'];
    if (!function_exists('fees_balance') || empty(fees_settings()['enabled'])) return ['ok' => false, 'error' => 'fees_off'];
    $mid = (string)$m['memberId'];
    if (db_row("SELECT 1 FROM membership_invoices WHERE memberId = ? AND status = 'open' AND purpose = 'joining' LIMIT 1", [$mid]))
        return ['ok' => false, 'error' => 'joining_open', 'detail' => 'Pay the joining invoice first. A plan is for the balance after it.'];
    if ($cur = plan_active_for($mid)) return ['ok' => false, 'error' => 'plan_exists', 'detail' => 'There is already a plan for this child.', 'planId' => (string)$cur['planId']];
    $due = (int)(fees_balance($m)['payable'] ?? 0);
    if ($due <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
    $q = plan_schedule($due, $count, $freq, $first);
    if (empty($q['ok'])) return $q;
    $by = trim((string)($agreed['by'] ?? ''));
    if (mb_strlen($by) < 3) return ['ok' => false, 'error' => 'agreed_by_required', 'detail' => 'Give the full name of the person agreeing to the plan.'];
    $pid = 'PLAN-' . strtoupper(rand_hex(5));
    $now = now_iso();
    $how = trim((string)($agreed['how'] ?? ''));
    db_tx(static function () use ($pid, $mid, $q, $due, $agreed, $by, $now, $how, $first, $freq, $count) {
        db_insert('payment_plans', ['planId' => $pid, 'memberId' => $mid, 'total' => $due, 'instalments' => $count, 'frequency' => $freq,
            'firstDue' => $first, 'startPaid' => plan_payments_total($mid), 'status' => 'active', 'source' => (string)($agreed['source'] ?? 'family'),
            'createdBy' => mb_substr((string)($agreed['actor'] ?? ''), 0, 80), 'agreedBy' => mb_substr($by, 0, 160), 'agreedAt' => $now, 'termsVersion' => PLAN_TERMS_VERSION,
            'note' => mb_substr(trim((string)($agreed['note'] ?? '')), 0, 600), 'createdAt' => $now, 'updatedAt' => $now]);
        foreach ($q['items'] as $it) db_insert('payment_plan_items', ['planId' => $pid, 'seq' => $it['seq'], 'dueDate' => $it['dueDate'], 'amount' => $it['amount']]);
        plan_event($pid, $mid, 'created', 0, (string)($agreed['actor'] ?? ''),
            'Agreed by ' . $by . ($how !== '' ? ' (' . $how . ')' : '') . ': ' . fees_money_text($due) . ' in ' . $count . ' instalments ' . PLAN_FREQ_LABEL[$freq] . ' from ' . $first . '. Terms ' . PLAN_TERMS_VERSION . '.', $due);
    });
    audit('plan.created', (string)($agreed['actor'] ?? ''), $mid, ['planId' => $pid, 'total' => $due, 'instalments' => $count, 'frequency' => $freq, 'firstDue' => $first, 'agreedBy' => $by, 'source' => (string)($agreed['source'] ?? 'family')], (string)($agreed['ip'] ?? ''));
    $plan = db_row('SELECT * FROM payment_plans WHERE planId = ?', [$pid]);
    return ['ok' => true, 'plan' => plan_state($plan, $m)];
}

/** What a plan would look like, without making it (the family sees it before agreeing). */
function plan_quote(array $m, int $count, string $freq, string $first): array {
    $due = function_exists('fees_balance') ? (int)(fees_balance($m)['payable'] ?? 0) : 0;
    if ($due <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
    $q = plan_schedule($due, $count, $freq, $first);
    return empty($q['ok']) ? $q : $q + ['terms' => PLAN_TERMS, 'termsVersion' => PLAN_TERMS_VERSION];
}

/** The invoice for what the plan asks for now (overdue first, else the next instalment). */
function plan_pay_invoice(array $m, string $by): array {
    $plan = plan_active_for((string)$m['memberId']);
    if (!$plan) return ['ok' => false, 'error' => 'no_plan'];
    $s = plan_state($plan, $m);
    if ($s['payNow'] <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
    $due = (int)(fees_balance($m)['payable'] ?? 0);
    if ($s['payNow'] >= $due) return membership_balance_invoice($m, $by);
    $label = $s['overdue'] > 0 ? 'Overdue instalments on plan ' . $plan['planId'] : 'Instalment ' . $s['next']['seq'] . ' of ' . $s['instalments'] . ' (due ' . gmdate('j M Y', strtotime($s['next']['dueDate'] . 'T00:00:00Z')) . ')';
    return membership_part_invoice($m, $by, $due, $s['payNow'], ['plan' => (string)$plan['planId'], 'label' => $label]);
}

/* ── Family ops ────────────────────────────────────────────────────────── */

function plan_family_member(array $p): ?array {
    $l = function_exists('family_link') ? family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? '')) : null;
    if (!$l) return null;
    return db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]) ?: null;
}

/** family.payplan.quote */
function family_plan_quote(array $p): array {
    $m = plan_family_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return plan_quote($m, (int)($p['instalments'] ?? 0), (string)($p['frequency'] ?? ''), (string)($p['firstDue'] ?? ''));
}

/** family.payplan.create — the guardian agrees, by name, to the terms they were shown. */
function family_plan_create(array $p): array {
    $m = plan_family_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (empty($p['agree']) || (string)($p['termsVersion'] ?? '') !== PLAN_TERMS_VERSION) return ['ok' => false, 'error' => 'terms_required', 'detail' => 'Read and accept the terms to set up the plan.'];
    $g = db_row('SELECT fullName FROM guardians WHERE guardianId = ? LIMIT 1', [(string)$p['guardianId']]) ?: [];
    $name = trim((string)($p['agreedName'] ?? '')) ?: trim((string)($g['fullName'] ?? ''));
    return plan_create($m, (int)($p['instalments'] ?? 0), (string)($p['frequency'] ?? ''), (string)($p['firstDue'] ?? ''),
        ['by' => $name, 'actor' => 'guardian:' . (string)$p['guardianId'], 'source' => 'family', 'how' => 'in the family app', 'ip' => (string)($p['ip'] ?? '')]);
}

/** family.payplan.pay — the next instalment (or everything overdue), on the /pay page. */
function family_plan_pay(array $p): array {
    $m = plan_family_member($p); if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return plan_pay_invoice($m, 'guardian:' . (string)$p['guardianId']);
}

/** For the family account (family_fees_view): the active plan, or whether one can be made. */
function plan_family_view(array $m, int $payable, bool $joiningOpen): array {
    $plan = plan_active_for((string)$m['memberId']);
    if ($plan) {
        $s = plan_state($plan, $m, null, $payable);
        return ['plan' => $s, 'planOffer' => null];
    }
    $can = !$joiningOpen && $payable >= PLAN_MIN_COUNT * (defined('MPAY_PART_MIN') ? MPAY_PART_MIN : 1000);
    return ['plan' => null, 'planOffer' => $can ? ['min' => PLAN_MIN_COUNT, 'max' => PLAN_MAX_COUNT, 'frequencies' => array_keys(PLAN_FREQUENCIES),
        'firstDueMax' => gmdate('Y-m-d', strtotime(plan_today() . 'T00:00:00Z') + PLAN_FIRST_DUE_MAX_DAYS * 86400), 'today' => plan_today(),
        'graceDays' => PLAN_GRACE_DAYS, 'terms' => PLAN_TERMS, 'termsVersion' => PLAN_TERMS_VERSION] : null];
}

/* ── Staff ops (Money → Instalment plans) — `fees`, centre-scoped ───────── */

function plan_admin_gate(array $p, string $planId = ''): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    if ($planId === '') return $g;
    $plan = db_row('SELECT * FROM payment_plans WHERE planId = ? LIMIT 1', [$planId]);
    if (!$plan) return ['ok' => false, 'error' => 'not_found'];
    $sg = fees_scope_gate($g['requester'], (string)$plan['memberId']); if (!$sg['ok']) return $sg;
    return $g + ['plan' => $plan];
}

const PLAN_HEALTHS = ['on_track', 'behind', 'broken', 'completed', 'cancelled'];

/**
 * admin.payplans.list — every plan in the reader's centres, with its health
 * worked out from the ledger, the totals for the screen, and paging. Health
 * is derived, so the filter is applied to the derived rows (above the page,
 * never to the page drawn).
 */
function admin_plans_list(array $p): array {
    $g = plan_admin_gate($p); if (!$g['ok']) return $g;
    $scope = admin_centre_names_in_scope($g['requester']);
    $where = ['1 = 1']; $args = [];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'rows' => [], 'total' => 0, 'counts' => array_fill_keys(PLAN_HEALTHS, 0), 'sums' => ['owed' => 0, 'overdue' => 0, 'collected' => 0]];
        $where[] = 'm.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') { $where[] = '(m.fullName LIKE ? OR m.memberId LIKE ? OR m.displayId LIKE ? OR pp.planId LIKE ? OR pp.agreedBy LIKE ?)'; $like = '%' . $q . '%'; array_push($args, $like, $like, $like, $like, $like); }
    $rows = db_all('SELECT pp.*, m.fullName, m.displayId, m.centre FROM payment_plans pp JOIN members m ON m.memberId = pp.memberId WHERE ' . implode(' AND ', $where) . ' ORDER BY pp.id DESC LIMIT 2000', $args);
    $today = plan_today();
    $counts = array_fill_keys(PLAN_HEALTHS, 0); $sums = ['owed' => 0, 'overdue' => 0, 'collected' => 0];
    $out = [];
    $states = plan_states_batch($rows, $today);
    foreach ($rows as $r) {
        $mid = (string)$r['memberId'];
        $s = $states[(string)$r['planId']];
        $counts[$s['health']] = ($counts[$s['health']] ?? 0) + 1;
        if (in_array($s['health'], ['on_track', 'behind', 'broken'], true)) { $sums['owed'] += $s['remaining']; $sums['overdue'] += $s['overdue']; }
        $sums['collected'] += $s['paid'];
        $out[] = ['planId' => $s['planId'], 'memberId' => $mid, 'fullName' => (string)$r['fullName'], 'displayId' => (string)$r['displayId'], 'centre' => (string)$r['centre'],
            'health' => $s['health'], 'total' => $s['total'], 'paid' => $s['paid'], 'remaining' => $s['remaining'], 'overdue' => $s['overdue'], 'daysLate' => $s['daysLate'],
            'next' => $s['next'], 'instalments' => $s['instalments'], 'frequency' => $s['frequency'], 'agreedBy' => $s['agreedBy'], 'source' => $s['source'], 'createdAt' => $s['createdAt']];
    }
    $h = (string)($p['health'] ?? '');
    if (in_array($h, PLAN_HEALTHS, true)) $out = array_values(array_filter($out, static fn($x) => $x['health'] === $h));
    elseif ($h === 'open') $out = array_values(array_filter($out, static fn($x) => in_array($x['health'], ['on_track', 'behind', 'broken'], true)));
    // Most urgent first: broken, then behind by days late, then the next due day.
    $rank = ['broken' => 0, 'behind' => 1, 'on_track' => 2, 'completed' => 3, 'cancelled' => 4];
    usort($out, static fn($a, $b) => [$rank[$a['health']], -$a['daysLate'], (string)($a['next']['dueDate'] ?? '9999')] <=> [$rank[$b['health']], -$b['daysLate'], (string)($b['next']['dueDate'] ?? '9999')]);
    $total = count($out);
    $size = max(1, min(PLAN_LIST_MAX, (int)($p['pageSize'] ?? 50)));
    $page = max(0, (int)($p['page'] ?? 0));
    return ['ok' => true, 'rows' => array_slice($out, $page * $size, $size), 'total' => $total, 'counts' => $counts, 'sums' => $sums, 'graceDays' => PLAN_GRACE_DAYS];
}

/** admin.payplans.get — one plan, its schedule against the money, and its whole record. */
function admin_plans_get(array $p): array {
    $g = plan_admin_gate($p, (string)($p['planId'] ?? '')); if (!$g['ok']) return $g;
    $plan = $g['plan'];
    $m = db_row('SELECT memberId, fullName, displayId, centre, parentName, parentPhone, parentEmail, type, status FROM members WHERE memberId = ?', [(string)$plan['memberId']]) ?: [];
    $s = plan_sync($plan);
    return ['ok' => true, 'plan' => $s, 'member' => $m, 'events' => plan_events((string)$plan['planId']), 'terms' => PLAN_TERMS, 'termsVersion' => (string)$plan['termsVersion'],
        'notices' => db_all("SELECT kind, refKey, status, reached, createdAt FROM dues_notices WHERE memberId = ? AND kind LIKE 'plan_%' AND refKey LIKE ? ORDER BY id DESC LIMIT 50", [(string)$plan['memberId'], (string)$plan['planId'] . '%'])];
}

/** admin.payplans.for — the plans on one member (the member record and the account screen). */
function admin_plans_for(array $p): array {
    $g = plan_admin_gate($p); if (!$g['ok']) return $g;
    $mid = trim((string)($p['memberId'] ?? ''));
    $sg = fees_scope_gate($g['requester'], $mid); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'plans' => array_map(static fn($r) => plan_state($r, $m), db_all('SELECT * FROM payment_plans WHERE memberId = ? ORDER BY id DESC LIMIT 20', [$mid]))];
}

/** admin.payplans.create — a plan agreed with a parent by phone, in person or in writing. */
function admin_plans_create(array $p): array {
    $g = plan_admin_gate($p); if (!$g['ok']) return $g;
    // The member by record ID or by the number printed on their card.
    $key = trim((string)($p['memberId'] ?? ''));
    $m = $key === '' ? null : db_row('SELECT * FROM members WHERE memberId = ? OR displayId = ? ORDER BY (memberId = ?) DESC LIMIT 1', [$key, $key, $key]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $sg = fees_scope_gate($g['requester'], (string)$m['memberId']); if (!$sg['ok']) return $sg;
    $how = (string)($p['how'] ?? '');
    if (!in_array($how, ['by phone', 'in person', 'in writing'], true)) return ['ok' => false, 'error' => 'how_required', 'detail' => 'Say how the parent agreed: by phone, in person or in writing.'];
    return plan_create($m, (int)($p['instalments'] ?? 0), (string)($p['frequency'] ?? ''), (string)($p['firstDue'] ?? ''),
        ['by' => (string)($p['agreedBy'] ?? ''), 'actor' => (string)$g['requester']['memberId'], 'source' => 'staff', 'how' => $how, 'note' => (string)($p['note'] ?? ''), 'ip' => (string)($p['ip'] ?? '')]);
}

/** admin.payplans.cancel — ends a plan. A reason is required, and the family is told. */
function admin_plans_cancel(array $p): array {
    $g = plan_admin_gate($p, (string)($p['planId'] ?? '')); if (!$g['ok']) return $g;
    $plan = $g['plan'];
    if ((string)$plan['status'] !== 'active') return ['ok' => false, 'error' => 'not_active', 'detail' => 'Only an active plan can be ended.'];
    $why = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($why) < 8) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why the plan is ending, in a sentence the family can read.'];
    $by = (string)$g['requester']['memberId'];
    db_exec("UPDATE payment_plans SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, cancelReason = ?, updatedAt = ? WHERE planId = ? AND status = 'active'",
        [now_iso(), $by, mb_substr($why, 0, 600), now_iso(), (string)$plan['planId']]);
    plan_event((string)$plan['planId'], (string)$plan['memberId'], 'cancelled', 0, $by, $why);
    audit('plan.cancelled', $by, (string)$plan['memberId'], ['planId' => $plan['planId'], 'reason' => $why], (string)($p['ip'] ?? ''));
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$plan['memberId']]);
    if ($m && function_exists('dues_notice_send')) {
        $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
        dues_notice_send($m, 'plan_ended', (string)$plan['planId'], ['title' => $first . '’s payment plan has ended',
            'text' => 'The centre ended the plan: ' . $why . ' The balance on the account is owed as normal. Speak to the centre if you would like a new plan.']);
    }
    return ['ok' => true];
}

/** admin.payplans.note — a staff note on the plan's record (a call made, a promise given). */
function admin_plans_note(array $p): array {
    $g = plan_admin_gate($p, (string)($p['planId'] ?? '')); if (!$g['ok']) return $g;
    $text = trim((string)($p['text'] ?? ''));
    if (mb_strlen($text) < 3) return ['ok' => false, 'error' => 'note_required'];
    plan_event((string)$g['plan']['planId'], (string)$g['plan']['memberId'], 'note', 0, (string)$g['requester']['memberId'], mb_substr($text, 0, 600));
    audit('plan.note', (string)$g['requester']['memberId'], (string)$g['plan']['memberId'], ['planId' => $g['plan']['planId']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'events' => plan_events((string)$g['plan']['planId'])];
}

/* ── Follow-ups (from dues_notices_run, daily) ─────────────────────────── */

function plan_reminders_run(?string $today = null): array {
    $today = $today ?? plan_today();
    $out = ['due' => 0, 'late' => 0, 'broken' => 0, 'completed' => 0];
    $plans = db_all("SELECT * FROM payment_plans WHERE status = 'active' ORDER BY id LIMIT 2000");
    $states = plan_states_batch($plans, $today);
    $members = [];
    foreach (array_chunk(array_values(array_unique(array_column($plans, 'memberId'))), 400) as $chunk)
        foreach (db_all('SELECT * FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk) as $r) $members[(string)$r['memberId']] = $r;
    foreach ($plans as $plan) {
        $m = $members[(string)$plan['memberId']] ?? null;
        if (!$m) continue;
        $s = plan_sync($plan, $states[(string)$plan['planId']]);
        if ($s['health'] === 'completed') { $out['completed']++; continue; }
        $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
        $pid = (string)$plan['planId'];
        $money = static fn(int $n) => fees_money_text($n);
        if ($s['health'] === 'broken') {
            $r = dues_notice_send($m, 'plan_broken', $pid, ['title' => $first . '’s payment plan has lapsed', 'amount' => $s['overdue'],
                'text' => 'An instalment is more than ' . PLAN_GRACE_DAYS . ' days late, so the plan has lapsed and the balance of ' . $money($s['remaining']) . ' is owed as normal. Pay what you can from the family account, or speak to the centre about a new plan.']);
            if (!empty($r['sent'])) { $out['broken']++; plan_event($pid, (string)$m['memberId'], 'reminded', 0, 'system', 'Told the family the plan has lapsed'); }
            continue;
        }
        foreach ($s['items'] as $it) {
            if ($it['left'] <= 0) continue;
            $until = plan_days_between($today, $it['dueDate']);
            if ($until >= 0 && $until <= PLAN_REMIND_BEFORE_DAYS) {
                $r = dues_notice_send($m, 'plan_due', $pid . ':' . $it['seq'], ['title' => 'Instalment ' . $it['seq'] . ' of ' . $s['instalments'] . ' for ' . $first . ': ' . $money($it['left']), 'amount' => $it['left'], 'dueOn' => $it['dueDate'],
                    'text' => $money($it['left']) . ' is due on ' . gmdate('j F', strtotime($it['dueDate'] . 'T00:00:00Z')) . ' on ' . $first . '’s payment plan. Pay it from the family account: Fees → Pay this instalment.']);
                if (!empty($r['sent'])) { $out['due']++; plan_event($pid, (string)$m['memberId'], 'reminded', $it['seq'], 'system', 'Reminded before the due day'); }
            } elseif ($it['status'] === 'late') {
                $r = dues_notice_send($m, 'plan_late', $pid . ':' . $it['seq'], ['title' => 'Instalment ' . $it['seq'] . ' for ' . $first . ' is late', 'amount' => $it['left'], 'dueOn' => $it['dueDate'],
                    'text' => $money($it['left']) . ' was due on ' . gmdate('j F', strtotime($it['dueDate'] . 'T00:00:00Z')) . '. Please pay it from the family account within ' . PLAN_GRACE_DAYS . ' days of that date to keep the plan, or speak to the centre.']);
                if (!empty($r['sent'])) { $out['late']++; plan_event($pid, (string)$m['memberId'], 'reminded', $it['seq'], 'system', 'Told the family it is late'); }
            }
            break;   // one instalment's notice a day: the earliest unpaid one
        }
    }
    return $out;
}

/** Members whose arrears reminder the plan replaces: on an active plan that has not lapsed. */
function plan_protected_members(): array {
    $out = [];
    foreach (plan_states_batch(db_all("SELECT * FROM payment_plans WHERE status = 'active'")) as $s) {
        if (in_array($s['health'], ['on_track', 'behind'], true)) $out[$s['memberId']] = true;
    }
    return $out;
}
