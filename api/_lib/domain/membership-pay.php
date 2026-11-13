<?php
declare(strict_types=1);

/**
 * Paying to join NGG — the membership fee and the first month's commitment fee.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────────
 * Nothing is asked of a family until their child is ACCEPTED. Acceptance
 * (admin.application.convert) creates one invoice and emails the family a
 * private link to it:
 *
 *   membership fee           the settings' membershipFee (Dues & arrears)
 *   commitment fee, month 1  the settings' monthlyDues, PRO-RATED to the start
 *
 * The invoice is paid by Paystack through the link, or OFFLINE (transfer, cash,
 * POS, bank deposit) — and an offline payment is recorded by staff instead, so
 * the family is never sent the link again for money they have already paid.
 * Either way the same settlement runs (membership_settle): the charges and the
 * payment go on the member's ledger, a numbered receipt is issued, and the
 * family is thanked with the receipt attached.
 *
 * ── FAIR TO THE START DATE ───────────────────────────────────────────────────
 * The commitment fee for the month a member starts is the share of THAT
 * month's meeting days still to come on their start date (their centre's
 * meeting days on the Club calendar; calendar days where no calendar is set).
 * Joining with one Saturday of four left costs a quarter of the month, not all
 * of it. The SAME function prices the first month in the dues accrual
 * (fees_accrue_member), so the ledger and the invoice can never disagree.
 *
 * ── OFFLINE PAYMENTS ARE CLAIMS UNTIL CHECKED ────────────────────────────────
 * Recording an offline payment needs evidence: the slip, receipt or bank alert
 * as an image or PDF, the bank or receipt-book reference, the payer, the date
 * and the exact amount. It is held as PENDING. A DIFFERENT member of staff with
 * the Fees permission verifies it by re-typing the reference and the amount
 * from the bank statement or the receipt book, and only then is the invoice
 * paid. The rules, all enforced here and not in a screen:
 *
 *   · the amount is the invoice's total, exactly — no part-payments to unpick;
 *   · the date is real, not in the future, not before the invoice;
 *   · a bank reference is used once, ever (and not one already on the ledger);
 *   · an evidence file is used once, ever — its SHA-256 is unique, so the same
 *     screenshot cannot settle two children's invoices, even after rejection;
 *   · the recorder cannot verify their own entry, and nobody records or
 *     verifies a payment for their own account;
 *   · the verifier must match the reference and amount they see on the
 *     statement — a verification is a check, not a click;
 *   · one pending claim per invoice; a paid or void invoice takes none.
 *
 * Every step is audited, and the evidence is kept in api/storage, which is not
 * web-servable; staff open it through an endpoint gated on `fees`.
 */

const MPAY_METHODS = ['transfer' => 'Bank transfer', 'deposit' => 'Bank deposit', 'pos' => 'POS / card terminal', 'cash' => 'Cash'];
const MPAY_EVIDENCE_MAX = 3 * 1024 * 1024;
const MPAY_EVIDENCE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
const MPAY_LIST_MAX = 300;
const MPAY_REF_MIN = 4;
const MPAY_REASON_MIN = 10;
/** Pro-rated amounts round to the nearest ₦10, like every other figure a family is quoted. */
const MPAY_ROUND = 10;

/* ── Terms and pricing ───────────────────────────────────────────────────── */

/** What joining costs, for the join form, the invoice and the payments screen. */
function membership_fee_terms(): array {
    $cfg = fees_settings();
    $pay = membership_pay_settings();
    return [
        'enabled' => !empty($cfg['enabled']) && ((int)$cfg['membershipFee'] > 0 || (int)$cfg['monthlyDues'] > 0),
        'currency' => (string)$cfg['currency'],
        'symbol' => FEES_CURRENCY_SYMBOL[(string)$cfg['currency']] ?? '',
        'membershipFee' => (int)$cfg['membershipFee'],
        'membershipEveryMonths' => (int)$cfg['membershipEveryMonths'],
        'monthlyCommitment' => (int)$cfg['monthlyDues'],
        'paystack' => paystack_secret() !== '',
        'bank' => $pay['bankName'] !== '' && $pay['accountNumber'] !== '' ? ['bankName' => $pay['bankName'], 'accountName' => $pay['accountName'], 'accountNumber' => $pay['accountNumber']] : null,
    ];
}

/** Bank details printed on the invoice for families who pay by transfer. */
function membership_pay_settings(): array {
    $s = setting_get('membership_pay');
    $s = is_array($s) ? $s : [];
    return [
        'bankName' => substr(trim((string)($s['bankName'] ?? '')), 0, 80),
        'accountName' => substr(trim((string)($s['accountName'] ?? '')), 0, 120),
        'accountNumber' => preg_replace('/\D+/', '', (string)($s['accountNumber'] ?? '')),
    ];
}

/**
 * The commitment fee for the month `$start` falls in, pro-rated to the start.
 *
 * remaining / total, where both count the member's meeting days in that month
 * (their centre's weekdays on the Club calendar, holidays out). With no
 * meeting days in the month at all — a term break, or no calendar — it falls
 * back to calendar days, so a fee is never divided by zero or waived by an
 * empty calendar.
 *
 * @return array{amount:int,full:int,remaining:int,total:int,basis:string,month:string}
 */
function membership_prorate(int $monthly, string $start, ?array $member = null): array {
    $month = substr($start, 0, 7);
    $out = ['amount' => 0, 'full' => max(0, $monthly), 'remaining' => 0, 'total' => 0, 'basis' => 'calendar', 'month' => $month];
    if ($monthly <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) return $out;
    $first = $month . '-01';
    $last = gmdate('Y-m-t', (int)strtotime($first . ' 00:00:00 UTC'));
    $days = [];
    if (function_exists('member_calendar_for') && function_exists('programme_days_between')) {
        $cal = member_calendar_for($member);
        if (!empty($cal['enabled'])) $days = programme_days_between($first, $last, array_merge($cal, ['startDate' => '', 'endDate' => '']));
    }
    if ($days) {
        $out['basis'] = 'meeting';
        $out['total'] = count($days);
        $out['remaining'] = count(array_filter($days, static fn($d) => $d >= $start));
    } else {
        $out['total'] = (int)gmdate('t', (int)strtotime($first . ' 00:00:00 UTC'));
        $out['remaining'] = $out['total'] - (int)substr($start, 8, 2) + 1;
    }
    $share = $out['total'] > 0 ? $out['remaining'] / $out['total'] : 0;
    $out['amount'] = min($monthly, (int)(round($monthly * $share / MPAY_ROUND) * MPAY_ROUND));
    return $out;
}

/** The lines of a joining invoice. Period keys match the dues accrual's, so the ledger is posted once. */
function membership_invoice_items(array $member, string $start): array {
    $cfg = fees_settings();
    $items = [];
    if ((int)$cfg['membershipFee'] > 0) {
        $per = fees_membership_periods($start, $start, (int)$cfg['membershipEveryMonths']);
        $every = (int)$cfg['membershipEveryMonths'];
        $items[] = ['kind' => 'membership', 'periodKey' => $per ? $per[0]['key'] : 'y1', 'amount' => (int)$cfg['membershipFee'],
            'label' => 'Membership fee' . ($every === 12 ? ' (one year)' : ($every > 0 ? ' (' . $every . ' months)' : '')),
            'detail' => $every > 0 ? 'Renews ' . gmdate('j F Y', (int)strtotime($start . ' 00:00:00 UTC +' . $every . ' months')) : 'Paid once'];
    }
    if ((int)$cfg['monthlyDues'] > 0) {
        $pr = membership_prorate((int)$cfg['monthlyDues'], $start, $member);
        $monthName = gmdate('F Y', (int)strtotime($start . ' 00:00:00 UTC'));
        if ($pr['amount'] > 0) {
            $unit = $pr['basis'] === 'meeting' ? 'meeting day' : 'day';
            $items[] = ['kind' => 'dues', 'periodKey' => $pr['month'], 'amount' => $pr['amount'],
                'label' => 'Commitment fee — ' . $monthName,
                'detail' => $pr['remaining'] === $pr['total']
                    ? 'Full month'
                    : 'From ' . gmdate('j F', (int)strtotime($start . ' UTC')) . ': ' . $pr['remaining'] . ' of ' . $pr['total'] . ' ' . $unit . ($pr['total'] === 1 ? '' : 's')
                      . ' (' . fees_money_text($pr['full'], $cfg) . ' a month)',
                'prorate' => $pr];
        }
    }
    return $items;
}

/* ── Invoices ────────────────────────────────────────────────────────────── */

function membership_origin(): string { return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'); }
function membership_pay_url(array $inv): string { return membership_origin() . '/pay/' . rawurlencode((string)$inv['payToken']); }
function membership_receipt_url(array $inv): string { return membership_origin() . '/api/public/receipt.php?t=' . rawurlencode((string)$inv['receiptToken']); }
function membership_invoice_by(string $col, string $v): ?array {
    if (!in_array($col, ['invoiceId', 'payToken', 'receiptToken', 'paystackRef'], true) || $v === '') return null;
    return db_row("SELECT * FROM membership_invoices WHERE $col = ? LIMIT 1", [$v]) ?: null;
}
function membership_items(array $inv): array { $i = json_decode((string)$inv['items'], true); return is_array($i) ? $i : []; }
/** Who the invoice and the receipt go to: the guardian first, as every intake mail does. */
function membership_contact(array $m): string {
    foreach (['parentEmail', 'email'] as $k) { $e = trim((string)($m[$k] ?? '')); if (filter_var($e, FILTER_VALIDATE_EMAIL)) return $e; }
    return '';
}

/**
 * The joining invoice for a member, created once. An open or paid one already
 * there is returned as it is — accepting twice must not bill twice.
 *
 * @return array{ok:bool,invoice?:array,error?:string,existed?:bool}
 */
function membership_invoice_create(array $m, string $by, int $applicationId = 0, string $start = ''): array {
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg'];
    $terms = membership_fee_terms();
    if (!$terms['enabled']) return ['ok' => false, 'error' => 'fees_off'];
    $have = db_row("SELECT * FROM membership_invoices WHERE memberId = ? AND status IN ('open','paid') AND purpose = 'joining' ORDER BY id DESC LIMIT 1", [(string)$m['memberId']]);
    if ($have) return ['ok' => true, 'invoice' => $have, 'existed' => true];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) $start = substr((string)($m['joinDate'] ?? ''), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) $start = gmdate('Y-m-d');
    $items = membership_invoice_items($m, $start);
    $total = array_sum(array_map(static fn($i) => (int)$i['amount'], $items));
    if ($total <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
    $row = [
        'memberId' => (string)$m['memberId'], 'applicationId' => $applicationId,
        'payToken' => rand_hex(20), 'items' => json_encode($items, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'total' => $total, 'currency' => (string)$terms['currency'], 'startDate' => $start,
        'status' => 'open', 'createdBy' => substr($by, 0, 64), 'createdAt' => now_iso(),
    ];
    $row = doc_invoice_insert($row);   // numbered NGG-INV-YYYY-#####, in the same transaction (documents.php)
    audit('membership.invoice.create', $by, (string)$m['memberId'], ['invoiceId' => $row['invoiceId'], 'total' => $total, 'start' => $start]);
    return ['ok' => true, 'invoice' => membership_invoice_by('invoiceId', $row['invoiceId'])];
}

/* ── Paying the balance online ─────────────────────────────────────────────
 *
 * The ledger (fees.php) records what a member owes and never takes money. A
 * family with dues, fines or fees outstanding paid by transfer and waited for
 * staff to record it; there was no way to pay on the site. This is that way,
 * and it adds no second payment path: a BALANCE invoice is an ordinary
 * membership_invoices row (purpose 'balance') for the amount payable today,
 * paid on the same /pay page, verified by the same Paystack check (exact
 * amount, currency and invoice), settled by the same membership_settle — which,
 * for a balance invoice, posts only the payment, because the charges are
 * already on the ledger.
 *
 * The amount is fixed when the invoice is made. Asking again while the balance
 * has moved voids the old open one ('superseded') and makes a new one, so a
 * family never pays a figure that is no longer true; a checkout already paid
 * against a voided invoice is recorded as unapplied for staff, never dropped
 * (membership_paystack_verify). An offline claim waiting on a check blocks a
 * new invoice, because that money may already be on its way.
 */
function membership_balance_invoice(array $m, string $by): array {
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg'];
    if (!function_exists('fees_balance')) return ['ok' => false, 'error' => 'fees_off'];
    $cfg = fees_settings();
    if (empty($cfg['enabled'])) return ['ok' => false, 'error' => 'fees_off'];
    if (paystack_secret() === '') return ['ok' => false, 'error' => 'payments_unavailable'];
    if (membership_contact($m) === '') return ['ok' => false, 'error' => 'no_email'];
    $mid = (string)$m['memberId'];
    // The joining invoice comes first: its charges are not on the ledger until it is paid.
    if ($j = db_row("SELECT payToken FROM membership_invoices WHERE memberId = ? AND status = 'open' AND purpose = 'joining' LIMIT 1", [$mid])) {
        return ['ok' => true, 'payUrl' => '/pay/' . rawurlencode((string)$j['payToken']), 'joining' => true];
    }
    $due = (int)(fees_balance($m, $cfg)['payable'] ?? 0);
    if ($due <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
    // An open advance invoice covers today's balance too, so it is replaced like a stale balance one.
    $open = db_all("SELECT * FROM membership_invoices WHERE memberId = ? AND status = 'open' AND purpose IN ('balance','advance') ORDER BY id DESC", [$mid]);
    foreach ($open as $o) {
        if (db_row("SELECT id FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$o['invoiceId']])) return ['ok' => false, 'error' => 'offline_pending'];
    }
    foreach ($open as $o) {
        if ((string)$o['purpose'] === 'balance' && (int)$o['total'] === $due) return ['ok' => true, 'payUrl' => '/pay/' . rawurlencode((string)$o['payToken']), 'invoiceId' => (string)$o['invoiceId'], 'total' => $due, 'existed' => true];
    }
    foreach ($open as $o) db_update('membership_invoices', ['status' => 'void', 'voidReason' => 'superseded: the balance changed'], ['id' => $o['id']]);
    $terms = membership_fee_terms();
    $row = [
        'memberId' => $mid, 'applicationId' => 0, 'payToken' => rand_hex(20),
        'items' => json_encode([['kind' => 'balance', 'label' => 'Balance due on ' . gmdate('j M Y'), 'detail' => 'Dues and fees on the account', 'amount' => $due, 'periodKey' => '']], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'total' => $due, 'currency' => (string)$terms['currency'], 'startDate' => gmdate('Y-m-d'),
        'status' => 'open', 'purpose' => 'balance', 'createdBy' => substr($by, 0, 64), 'createdAt' => now_iso(),
    ];
    $row = doc_invoice_insert($row);
    audit('membership.balance.invoice', $by, $mid, ['invoiceId' => $row['invoiceId'], 'total' => $due, 'superseded' => count($open)]);
    return ['ok' => true, 'payUrl' => '/pay/' . rawurlencode($row['payToken']), 'invoiceId' => $row['invoiceId'], 'total' => $due];
}

/** member.fees.pay — the signed-in member's own balance. */
function member_fees_pay(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return membership_balance_invoice($m, (string)$m['memberId']);
}

/** family.fees.pay — a guardian paying for one of their own, active links. */
function family_fees_pay(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $l = function_exists('family_link') ? family_link($gid, (string)($p['linkId'] ?? '')) : null;
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return membership_balance_invoice($m, 'guardian:' . $gid);
}

/* ── Paying ahead ────────────────────────────────────────────────────────
 *
 * A family may pay months of the commitment fee ahead, and the membership
 * renewal that falls in those months with them. Nothing is charged early:
 * the invoice (purpose 'advance') posts only the PAYMENT when it settles, and
 * the charges arrive on the ledger on their own dates through the accrual,
 * where the credit already waiting meets them. So `payable` stays the real
 * figure owed today, a reminder never goes to a family that is paid ahead,
 * and a fee changed in the meantime is charged at its new price against the
 * same credit — never re-priced on an invoice already paid.
 *
 * The plan walks the months to come in date order, spending the credit on
 * each charge as it would fall, so "paid ahead to March" is what the accrual
 * will actually do, renewal included.
 */
const MPAY_ADVANCE_MONTHS = [1, 3, 6, 12];
const MPAY_ADVANCE_HORIZON = 36;

/** The charges still to come, in date order: every dues month and renewal not yet on the ledger. */
function membership_upcoming_charges(array $m, array $cfg, int $months, ?string $asOf = null): array {
    $today = $asOf ?? gmdate('Y-m-d');
    $ten = fees_tenure($m, $cfg, $today);
    $start = (string)$ten['start'];
    if ($start === '') return [];
    $on = [];
    foreach (fees_entries((string)$m['memberId']) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '' || (string)$e['direction'] !== 'charge') continue;
        $on[(string)$e['kind'] . '|' . (string)$e['periodKey']] = true;
    }
    $settled = substr(trim((string)($m['feesSettledThrough'] ?? '')), 0, 10);
    $from = max($start, gmdate('Y-m-01', (int)strtotime($today . ' 00:00:00 UTC')));
    $upto = gmdate('Y-m-t', (int)strtotime(substr($from, 0, 7) . '-01 00:00:00 UTC +' . ($months - 1) . ' months'));
    $out = [];
    if ((int)$cfg['monthlyDues'] > 0) {
        foreach (fees_due_months($from, $upto, $months) as $mk) {
            if (isset($on['dues|' . $mk]) || ($settled !== '' && $mk <= substr($settled, 0, 7))) continue;
            $out[] = ['kind' => 'dues', 'key' => $mk, 'due' => $mk . '-01', 'amount' => (int)$cfg['monthlyDues']];
        }
    }
    if ((int)$cfg['membershipFee'] > 0 && (int)$cfg['membershipEveryMonths'] > 0) {
        foreach (fees_membership_periods($start, $upto, (int)$cfg['membershipEveryMonths']) as $per) {
            if (isset($on['membership|' . $per['key']]) || (string)$per['due'] < $from || ($settled !== '' && (string)$per['due'] <= $settled)) continue;
            $out[] = ['kind' => 'membership', 'key' => (string)$per['key'], 'due' => (string)$per['due'], 'amount' => (int)$cfg['membershipFee']];
        }
    }
    usort($out, static fn($a, $b) => strcmp($a['due'], $b['due']) ?: strcmp($a['kind'], $b['kind']));
    return $out;
}

/**
 * Where a member's account stands for paying ahead: the credit already on it,
 * the month it is paid to, and a priced quote for each choice of months.
 */
function membership_advance_plan(array $m, ?string $asOf = null): array {
    $cfg = fees_settings();
    $bal = fees_balance($m, $cfg, $asOf);
    $credit = max(0, (int)$bal['realCredited'] - (int)$bal['realCharged']);
    $coming = membership_upcoming_charges($m, $cfg, MPAY_ADVANCE_HORIZON, $asOf);
    // Spend the credit on the charges in the order they will fall.
    $left = $credit; $through = ''; $i = 0;
    for (; $i < count($coming); $i++) {
        if ($left < $coming[$i]['amount']) break;
        $left -= $coming[$i]['amount'];
        if ($coming[$i]['kind'] === 'dues') $through = $coming[$i]['key'];
    }
    $rest = array_slice($coming, $i);
    $quotes = [];
    foreach (MPAY_ADVANCE_MONTHS as $n) {
        $q = membership_advance_quote($rest, $left, (int)$bal['payable'], $n);
        if ($q) $quotes[] = $q;
    }
    return ['credit' => $credit, 'paidThrough' => $through, 'payable' => (int)$bal['payable'],
        'monthly' => (int)$cfg['monthlyDues'], 'membershipFee' => (int)$cfg['membershipFee'], 'quotes' => $quotes];
}

/** One priced choice: what is owed today, then n months of dues and any renewal among them, less a part-month credit. */
function membership_advance_quote(array $rest, int $leftover, int $payable, int $months): ?array {
    $dues = []; $renew = []; $count = 0;
    foreach ($rest as $c) {
        if ($c['kind'] === 'dues') { if ($count >= $months) break; $count++; $dues[] = $c; }
        else $renew[] = $c;
    }
    if ($count < $months) return null;
    $lastDue = end($dues)['due'];
    $renew = array_values(array_filter($renew, static fn($r) => $r['due'] <= $lastDue));
    $label = static fn($mk) => gmdate('M Y', (int)strtotime($mk . '-01 12:00:00 UTC'));
    $items = [];
    if ($payable > 0) $items[] = ['kind' => 'balance', 'label' => 'Owed today', 'detail' => 'Dues and fees already on the account', 'amount' => $payable, 'periodKey' => ''];
    $sum = array_sum(array_column($dues, 'amount'));
    $items[] = ['kind' => 'advance', 'label' => 'Commitment fee · ' . $label($dues[0]['key']) . ($months > 1 ? ' – ' . $label(end($dues)['key']) : ''),
        'detail' => $months . ' month' . ($months === 1 ? '' : 's') . ' ahead', 'amount' => $sum, 'periodKey' => ''];
    foreach ($renew as $r) $items[] = ['kind' => 'advance', 'label' => 'Membership renewal', 'detail' => 'Due ' . gmdate('j M Y', (int)strtotime($r['due'] . ' 12:00:00 UTC')), 'amount' => $r['amount'], 'periodKey' => ''];
    $total = $payable + $sum + array_sum(array_column($renew, 'amount'));
    if ($leftover > 0) { $use = min($leftover, $total); $items[] = ['kind' => 'credit', 'label' => 'Already paid ahead', 'detail' => 'Credit on the account', 'amount' => -$use, 'periodKey' => '']; $total -= $use; }
    if ($total <= 0) return null;
    return ['months' => $months, 'through' => end($dues)['key'], 'throughL' => $label(end($dues)['key']), 'total' => $total, 'items' => $items];
}

/**
 * An invoice for paying ahead. The quote is priced here, from the plan, never
 * from a figure the page sent; an open balance or advance invoice is replaced
 * so a family never holds two links for overlapping money.
 */
function membership_advance_invoice(array $m, int $months, string $by): array {
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg'];
    if (!in_array($months, MPAY_ADVANCE_MONTHS, true)) return ['ok' => false, 'error' => 'bad_months', 'detail' => 'Choose 1, 3, 6 or 12 months.'];
    $cfg = fees_settings();
    if (empty($cfg['enabled'])) return ['ok' => false, 'error' => 'fees_off'];
    $terms = membership_fee_terms();
    if (!$terms['paystack'] && !$terms['bank']) return ['ok' => false, 'error' => 'payments_unavailable'];
    if (membership_contact($m) === '') return ['ok' => false, 'error' => 'no_email'];
    $mid = (string)$m['memberId'];
    if (db_row("SELECT 1 FROM membership_invoices WHERE memberId = ? AND status = 'open' AND purpose = 'joining' LIMIT 1", [$mid])) {
        return ['ok' => false, 'error' => 'joining_open', 'detail' => 'Pay the joining invoice first. Paying ahead opens once membership is complete.'];
    }
    $plan = membership_advance_plan($m);
    $q = null;
    foreach ($plan['quotes'] as $x) if ($x['months'] === $months) $q = $x;
    if (!$q) return ['ok' => false, 'error' => 'nothing_to_pay', 'detail' => 'There is nothing to pay ahead for that many months.'];
    $open = db_all("SELECT * FROM membership_invoices WHERE memberId = ? AND status = 'open' AND purpose IN ('balance','advance') ORDER BY id DESC", [$mid]);
    foreach ($open as $o) {
        if (db_row("SELECT id FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$o['invoiceId']])) return ['ok' => false, 'error' => 'offline_pending'];
    }
    foreach ($open as $o) {
        if ((string)$o['purpose'] === 'advance' && (int)$o['total'] === $q['total'] && (string)$o['items'] === json_encode($q['items'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) {
            return ['ok' => true, 'payUrl' => '/pay/' . rawurlencode((string)$o['payToken']), 'invoiceId' => (string)$o['invoiceId'], 'total' => $q['total'], 'through' => $q['through'], 'existed' => true];
        }
    }
    foreach ($open as $o) db_update('membership_invoices', ['status' => 'void', 'voidReason' => 'superseded: a new payment was asked for'], ['id' => $o['id']]);
    $row = [
        'memberId' => $mid, 'applicationId' => 0, 'payToken' => rand_hex(20),
        'items' => json_encode($q['items'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'total' => $q['total'], 'currency' => (string)$terms['currency'], 'startDate' => gmdate('Y-m-d'),
        'status' => 'open', 'purpose' => 'advance', 'createdBy' => substr($by, 0, 64), 'createdAt' => now_iso(),
    ];
    $row = doc_invoice_insert($row);
    audit('membership.advance.invoice', $by, $mid, ['invoiceId' => $row['invoiceId'], 'total' => $q['total'], 'months' => $months, 'through' => $q['through'], 'superseded' => count($open)]);
    return ['ok' => true, 'payUrl' => '/pay/' . rawurlencode($row['payToken']), 'invoiceId' => $row['invoiceId'], 'total' => $q['total'], 'through' => $q['through']];
}

/** family.fees.advance — a guardian paying ahead for one of their own, active links. */
function family_fees_advance(array $p): array {
    $gid = (string)($p['guardianId'] ?? '');
    $l = function_exists('family_link') ? family_link($gid, (string)($p['linkId'] ?? '')) : null;
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return membership_advance_invoice($m, (int)($p['months'] ?? 0), 'guardian:' . $gid);
}

/** The invoice's lines as an email table. */
function membership_items_html(array $inv, bool $paid = false): string {
    $cfg = fees_settings();
    $rows = '';
    foreach (membership_items($inv) as $it) {
        $rows .= '<tr><td style="padding:10px 0;border-bottom:1px solid #eceef2"><b>' . esc_html($it['label']) . '</b>'
            . (!empty($it['detail']) ? '<br><span style="color:#5a6488;font-size:13px">' . esc_html($it['detail']) . '</span>' : '')
            . '</td><td style="padding:10px 0;border-bottom:1px solid #eceef2;text-align:right;white-space:nowrap">' . esc_html(fees_money_text((int)$it['amount'], $cfg)) . '</td></tr>';
    }
    $rows .= '<tr><td style="padding:12px 0 0"><b>' . ($paid ? 'Total paid' : 'Total to pay') . '</b></td><td style="padding:12px 0 0;text-align:right;font-size:17px"><b>' . esc_html(fees_money_text((int)$inv['total'], $cfg)) . '</b></td></tr>';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14.5px">' . $rows . '</table>';
}

/** Email the family the link to pay. Sent on acceptance, and again only when staff ask. */
function membership_invoice_send(array $inv, ?array $m = null): array {
    $m = $m ?? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];
    $to = membership_contact($m);
    if ($to === '') return ['ok' => false, 'error' => 'no_email'];
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
    $terms = membership_fee_terms();
    $bank = $terms['bank'];
    $body = '<p style="margin:0 0 14px">' . esc_html($first) . '’s joining invoice: the membership fee and the first month. Membership is complete once it is paid.</p>'
        . membership_items_html($inv)
        . '<p style="margin:16px 0 0;color:#5a6488;font-size:13.5px">The commitment fee for the first month is charged only for the meeting days left from the start date, ' . esc_html(gmdate('j F Y', (int)strtotime($inv['startDate'] . ' UTC'))) . '. From the next month it is charged in full.</p>'
        . ($bank ? '<p style="margin:14px 0 0;font-size:14px"><b>Prefer to pay by transfer?</b> ' . esc_html($bank['bankName']) . ' · ' . esc_html($bank['accountNumber']) . ' · ' . esc_html($bank['accountName'])
            . '. Use <b>' . esc_html($inv['invoiceId']) . '</b> as the narration and keep the slip — our team checks it and sends the receipt. Please do not pay twice.</p>' : '')
        . '<p style="margin:14px 0 0;font-size:13px;color:#5a6488">Invoice ' . esc_html($inv['invoiceId']) . ' · member ' . esc_html((string)($m['displayId'] ?: $m['memberId'])) . '</p>';
    $ok = @send_mail($to, 'Complete ' . $first . '’s NGG membership — ' . fees_money_text((int)$inv['total']), email_template([
        // Its own name, not a second "Welcome": the welcome email (admin_application_convert) points here.
        'title' => 'Joining invoice for ' . $first,
        'intro' => 'One step to complete membership.',
        'bodyHtml' => $body,
        'ctaLabel' => $terms['paystack'] ? 'Pay ' . fees_money_text((int)$inv['total']) . ' securely' : 'View the invoice',
        'ctaUrl' => membership_pay_url($inv),
        'footNote' => 'This link is private to your family. Payment is processed by Paystack; we never see card details.',
    ]));
    if ($ok) db_update('membership_invoices', ['sentTo' => $to, 'sentAt' => now_iso()], ['id' => $inv['id']]);
    return ['ok' => (bool)$ok, 'to' => mask_email($to), 'error' => $ok ? null : 'send_failed'];
}

/* ── Settling: the one place an invoice becomes paid ─────────────────────── */

/**
 * Mark an invoice paid: its charges and the payment on the ledger, a receipt,
 * and the family thanked. Idempotent — a webhook and a callback racing, or a
 * verifier pressing twice, settle once.
 */
function membership_settle(string $invoiceId, string $via, string $reference, string $by, array $extra = []): array {
    // The suite stands in for a ledger that refuses the post.
    if (!empty($GLOBALS['__membership_settle_throw'])) throw new RuntimeException('ledger_failed');
    $res = db_tx(static function () use ($invoiceId, $via, $reference, $by, $extra) {
        $inv = membership_invoice_by('invoiceId', $invoiceId);
        if (!$inv) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$inv['status'] === 'paid') return ['ok' => true, 'already' => true, 'invoice' => $inv];
        if ((string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];
        $memberId = (string)$inv['memberId'];
        $purpose = (string)($inv['purpose'] ?? 'joining');
        $balance = $purpose === 'balance';
        /* A balance invoice's charges are already on the ledger, and an advance
           invoice's arrive on their own dates through the accrual: for both,
           only the payment is posted. */
        if ($purpose === 'joining') foreach (membership_items($inv) as $it) {
            fees_post($memberId, (string)$it['kind'], (int)$it['amount'], ['periodKey' => (string)$it['periodKey'], 'note' => (string)$it['label'], 'by' => 'invoice:' . $invoiceId]);
        }
        $credit = fees_post($memberId, 'payment', (int)$inv['total'], ['periodKey' => 'minv:' . $invoiceId,
            'note' => ($balance ? 'Balance payment ' : ($purpose === 'advance' ? 'Paid ahead ' : 'Joining invoice ')) . $invoiceId . ' — ' . (MPAY_METHODS[$via] ?? ($via === 'paystack' ? 'Paystack' : $via)),
            'method' => $via, 'reference' => $reference, 'by' => $by]);
        if (!$credit) throw new RuntimeException('ledger_failed');
        /* The receipt is numbered and frozen inside this transaction
           (documents.php): no payment without its receipt, no receipt number
           without its payment, and no gap in the series if either fails. */
        $rcp = doc_receipt_issue($inv, $via, $reference, $extra);
        db_update('membership_invoices', ['status' => 'paid', 'paidVia' => $via, 'paidAt' => now_iso(),
            'receiptNo' => $rcp['no'], 'receiptToken' => rand_hex(16)] + ($via === 'paystack' ? ['paystackRef' => $reference] : []), ['id' => $inv['id']]);
        audit('membership.invoice.paid', $by, $memberId, ['invoiceId' => $invoiceId, 'via' => $via, 'reference' => $reference, 'total' => (int)$inv['total']] + $extra);
        return ['ok' => true, 'invoice' => membership_invoice_by('invoiceId', $invoiceId)];
    });
    if (!empty($res['ok']) && empty($res['already'])) $res['receipt'] = membership_send_receipt($res['invoice']);
    return $res;
}

/** Thank the family, with the receipt. */
function membership_send_receipt(array $inv): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $to = membership_contact($m);
    if ($to === '') return ['ok' => false, 'error' => 'no_email'];
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
    $ok = @send_mail($to, 'Thank you — payment received · receipt ' . $inv['receiptNo'], email_template([
        'title' => ['advance' => 'Thank you. ' . $first . ' is paid ahead.', 'balance' => 'Thank you. ' . $first . '’s account is paid.'][(string)($inv['purpose'] ?? '')] ?? 'Thank you. ' . $first . ' is fully enrolled.',
        'intro' => 'We have received your payment of ' . fees_money_text((int)$inv['total']) . '. Your support keeps the programme running.',
        'bodyHtml' => membership_items_html($inv, true)
            . '<p style="margin:16px 0 0;font-size:14px"><b>Receipt</b> ' . esc_html($inv['receiptNo']) . ' · <b>Invoice</b> ' . esc_html($inv['invoiceId']) . '</p>'
            . ((string)($inv['purpose'] ?? '') === 'advance'
                ? '<p style="margin:12px 0 0;font-size:14px">The payment is held on ' . esc_html($first) . '’s account and meets each charge on the day it falls due, so there is nothing more to pay until it is used up. We look forward to seeing ' . esc_html($first) . ' at the centre.</p>'
                : '<p style="margin:12px 0 0;font-size:14px">From next month the commitment fee is ' . esc_html(fees_money_text((int)fees_settings()['monthlyDues'])) . ' a month. We look forward to seeing ' . esc_html($first) . ' at the centre.</p>'),
        'ctaLabel' => 'View and print the receipt',
        'ctaUrl' => membership_receipt_url($inv),   // receipt.php renders the frozen receipt (documents.php)
        'footNote' => 'With thanks from the Next Generation Genius team.',
    ]));
    return ['ok' => (bool)$ok, 'to' => mask_email($to)];
}

/* ── Paystack ────────────────────────────────────────────────────────────── */

/**
 * Paystack's charge on a payment of $net, when the family bears it: the
 * smallest gross whose own Paystack charge leaves at least $net for NGG.
 * 0 when it is switched off. Whole naira, rounded up — NGG is never short by a
 * kobo. The flat part is waived when the GROSS is under the threshold, so the
 * waiver is tested on the gross; past the cap, the cap is the charge.
 */
function paystack_family_charge(int $net, ?array $cfg = null): int {
    $cfg = $cfg ?? fees_settings();
    if ($net <= 0 || empty($cfg['payFeeOn'])) return 0;
    $rate = max(0, (int)$cfg['payFeeBps']) / 10000;
    if ($rate >= 1) return 0;
    $flat = max(0, (int)$cfg['payFeeFlat']); $under = max(0, (int)$cfg['payFeeFlatUnder']); $cap = max(0, (int)$cfg['payFeeCap']);
    $gross = (int)ceil($net / (1 - $rate) - 1e-9);
    if ($flat > 0 && $gross >= $under) $gross = (int)ceil(($net + $flat) / (1 - $rate) - 1e-9);
    $fee = $gross - $net;
    if ($cap > 0 && $fee > $cap) $fee = $cap;
    return max(0, $fee);
}

/** What the family sees at /pay/<token>: no ledger, no other child, nothing to enumerate. */
function public_membership_invoice(array $p): array {
    $inv = membership_invoice_by('payToken', trim((string)($p['token'] ?? '')));
    if (!$inv || (string)$inv['status'] === 'void') return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT fullName, displayId, memberId, centre FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]) ?: [];
    $pending = (string)$inv['status'] === 'open' ? db_row("SELECT method, recordedAt FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$inv['invoiceId']]) : null;
    $terms = membership_fee_terms();
    return ['ok' => true, 'invoice' => [
        'invoiceId' => (string)$inv['invoiceId'], 'status' => (string)$inv['status'], 'total' => (int)$inv['total'],
        'purpose' => (string)($inv['purpose'] ?? 'joining'),
        'currency' => (string)$inv['currency'], 'symbol' => $terms['symbol'], 'startDate' => (string)$inv['startDate'],
        'items' => array_map(static fn($i) => ['label' => (string)$i['label'], 'detail' => (string)($i['detail'] ?? ''), 'amount' => (int)$i['amount']], membership_items($inv)),
        'firstName' => explode(' ', trim((string)($m['fullName'] ?? '')))[0] ?? '', 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
        'paidAt' => (string)$inv['paidAt'], 'receiptNo' => (string)$inv['receiptNo'],
        'receiptUrl' => (string)$inv['status'] === 'paid' ? membership_receipt_url($inv) : '',
        'invoiceUrl' => doc_view_url(doc_for_invoice($inv)),   // the printable invoice (documents.php)
        'pendingOffline' => $pending ? ['method' => MPAY_METHODS[(string)$pending['method']] ?? '', 'at' => (string)$pending['recordedAt']] : null,
        'paystack' => $terms['paystack'], 'bank' => $terms['bank'],
        /* Paying online adds Paystack's charge; paying by transfer does not. Said before anybody presses Pay.
           A paid invoice shows the charge that was actually taken with it. */
        'onlineFee' => (string)$inv['status'] === 'paid' ? (int)($inv['processingFee'] ?? 0) : ($terms['paystack'] ? paystack_family_charge((int)$inv['total']) : 0),
    ]];
}

/** Start a Paystack payment for an open invoice. */
function public_membership_pay_init(array $p): array {
    if (paystack_secret() === '') return ['ok' => false, 'error' => 'payments_unavailable'];
    $inv = membership_invoice_by('payToken', trim((string)($p['token'] ?? '')));
    if (!$inv) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$inv['status'] === 'paid') return ['ok' => false, 'error' => 'already_paid'];
    if ((string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];
    // An offline payment awaiting its check would be paid twice.
    if (db_row("SELECT id FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$inv['invoiceId']])) return ['ok' => false, 'error' => 'offline_pending'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]) ?: [];
    /* A balance link is a quote of what was owed THEN. Settled another way
       since — cash at the desk, an approved claim, a waiver — and the old link
       still took the full amount online: the family paid twice and held the
       difference as credit. The balance is read again here; changed, the old
       invoice is withdrawn and the family is sent to one for today's figure. */
    if ((string)($inv['purpose'] ?? '') === 'balance' && $m && function_exists('fees_balance')) {
        $due = (int)(fees_balance($m)['payable'] ?? 0);
        if ($due !== (int)$inv['total']) {
            db_exec("UPDATE membership_invoices SET status = 'void', voidReason = ? WHERE id = ? AND status = 'open'", ['superseded: the balance changed before payment', $inv['id']]);
            audit('membership.balance.superseded', 'system', (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'was' => (int)$inv['total'], 'now' => $due]);
            if ($due <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
            $fresh = membership_balance_invoice($m, 'system');
            return ['ok' => false, 'error' => 'balance_changed', 'detail' => (string)($fresh['payUrl'] ?? '')];
        }
    }
    $email = membership_contact($m);
    if ($email === '') return ['ok' => false, 'error' => 'no_email'];
    $ref = 'NGGM-' . strtoupper(rand_hex(8));
    /* The family bears Paystack's charge: the checkout is for the invoice plus the charge, and the charge
       rides in the transaction's own metadata (set here, server-side), so verify knows what THIS checkout
       was for even if the setting changes before the family pays. The invoice — and the ledger — stay the fee. */
    $fee = paystack_family_charge((int)$inv['total']);
    $r = paystack_http('POST', '/transaction/initialize', ['email' => $email, 'amount' => ((int)$inv['total'] + $fee) * 100, 'currency' => (string)$inv['currency'],
        'reference' => $ref, 'callback_url' => membership_pay_url($inv),
        'metadata' => ['invoiceId' => (string)$inv['invoiceId'], 'memberId' => (string)$inv['memberId'], 'kind' => 'ngg_membership', 'processingFee' => $fee]]);
    if (empty($r['status']) || empty($r['data']['authorization_url'])) return ['ok' => false, 'error' => 'init_failed'];
    db_update('membership_invoices', ['paystackRef' => $ref], ['id' => $inv['id']]);
    audit('membership.paystack.init', null, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $ref, 'processingFee' => $fee], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'authorizationUrl' => (string)$r['data']['authorization_url'], 'reference' => $ref, 'total' => (int)$inv['total'], 'processingFee' => $fee];
}

/**
 * Settle from Paystack's own answer, never from the browser's word. The
 * transaction must be a success, in the invoice's currency, for the invoice's
 * exact total, and tagged with THIS invoice — a successful ₦100 transaction
 * cannot be replayed against a ₦25,000 invoice.
 */
function membership_paystack_verify(string $reference): array {
    if (!preg_match('/^NGGM-[A-F0-9]{16}$/', $reference)) return ['ok' => false, 'error' => 'bad_reference'];
    $r = paystack_http('GET', '/transaction/verify/' . rawurlencode($reference));
    $d = is_array($r['data'] ?? null) ? $r['data'] : [];
    $invoiceId = (string)($d['metadata']['invoiceId'] ?? '');
    $inv = $invoiceId !== '' ? membership_invoice_by('invoiceId', $invoiceId) : membership_invoice_by('paystackRef', $reference);
    if (!$inv) return ['ok' => false, 'error' => 'not_found'];
    $succeeded = !empty($r['status']) && ($d['status'] ?? '') === 'success';
    /* Paid at Paystack, but the invoice is no longer open — voided, or paid
       another way in the meantime. The family's money arrived; it is put on
       the record for a person to refund or apply, never dropped. Once per
       reference. */
    $appliedHere = (string)$inv['status'] === 'paid' && (string)$inv['paidVia'] === 'paystack' && (string)$inv['paystackRef'] === $reference;
    if ($succeeded && (string)$inv['status'] !== 'open' && !$appliedHere
        && !db_row("SELECT id FROM audit_log WHERE event = 'membership.paystack.unapplied' AND meta LIKE ? LIMIT 1", ['%"' . $reference . '"%'])) {
        audit('membership.paystack.unapplied', 'paystack', (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $reference, 'amount' => (int)($d['amount'] ?? 0), 'currency' => (string)($d['currency'] ?? ''), 'invoiceStatus' => (string)$inv['status']]);
    }
    if ($succeeded && (string)$inv['status'] !== 'open' && !$appliedHere)
        unapplied_record($reference, 'unapplied', $inv, (int)round(((int)($d['amount'] ?? 0)) / 100), (string)($d['currency'] ?? 'NGN'));
    if ((string)$inv['status'] === 'paid') return ['ok' => true, 'status' => 'paid', 'invoice' => $inv];
    if ((string)$inv['status'] !== 'open') {
        if ($succeeded) return ['ok' => false, 'error' => 'not_open', 'detail' => 'This invoice was cancelled after the payment started. The payment is recorded and the centre will refund or apply it.'];
        return ['ok' => true, 'status' => (string)$inv['status'], 'invoice' => $inv];
    }
    if (!$succeeded) return ['ok' => true, 'status' => (string)($d['status'] ?? 'pending'), 'invoice' => $inv];
    /* The charge this checkout carried, from the transaction's own metadata (we set it at initialise; a
       checkout started before the family bore the charge has none). It may not exceed the invoice itself. */
    $fee = max(0, (int)($d['metadata']['processingFee'] ?? 0));
    if ($fee > (int)$inv['total']) $fee = -1;
    if ($fee < 0 || (string)($d['reference'] ?? '') !== $reference || (int)($d['amount'] ?? 0) !== ((int)$inv['total'] + max(0, $fee)) * 100
        || strtoupper((string)($d['currency'] ?? '')) !== strtoupper((string)$inv['currency'])) {
        audit('membership.paystack.mismatch', null, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $reference, 'amount' => (int)($d['amount'] ?? 0), 'currency' => (string)($d['currency'] ?? '')]);
        // Money that DID arrive, for an amount the invoice does not match: on the record for a person.
        if ($succeeded && (string)($d['reference'] ?? '') === $reference)
            unapplied_record($reference, 'mismatch', $inv, (int)round(((int)($d['amount'] ?? 0)) / 100), (string)($d['currency'] ?? 'NGN'));
        return ['ok' => false, 'error' => 'payment_mismatch'];
    }
    // The charge is recorded on the invoice (for the receipt), never on the ledger: it is Paystack's, not something owed to NGG.
    db_update('membership_invoices', ['processingFee' => $fee], ['id' => $inv['id']]);
    $s = membership_settle((string)$inv['invoiceId'], 'paystack', $reference, 'paystack', ['channel' => (string)($d['channel'] ?? ''),
        'last4' => (string)($d['authorization']['last4'] ?? '')]);
    return ['ok' => !empty($s['ok']), 'status' => !empty($s['ok']) ? 'paid' : 'failed', 'invoice' => $s['invoice'] ?? $inv, 'error' => $s['error'] ?? null];
}

/** The /pay page's check after Paystack sends the family back. */
function public_membership_pay_verify(array $p): array {
    $inv = membership_invoice_by('payToken', trim((string)($p['token'] ?? '')));
    if (!$inv) return ['ok' => false, 'error' => 'not_found'];
    $ref = trim((string)($p['reference'] ?? ''));
    if ((string)$inv['status'] !== 'paid') {
        /* Any of this invoice's checkouts, not only the latest: a family who
           opened Paystack twice and paid in the first tab has paid. Paystack's
           own answer must name THIS invoice, so another invoice's reference
           pasted into this link settles nothing here. */
        $v = membership_paystack_verify($ref);
        if (empty($v['ok'])) return ['ok' => false, 'error' => $v['error'] ?? 'failed'];
        if ((string)($v['invoice']['invoiceId'] ?? '') !== (string)$inv['invoiceId']) return ['ok' => false, 'error' => 'bad_reference'];
    }
    return public_membership_invoice(['token' => $inv['payToken']]);
}

/* ── Staff ───────────────────────────────────────────────────────────────── */

/** Where evidence is kept: api/storage, which no URL reaches. */
function membership_evidence_dir(): string {
    $dir = __DIR__ . '/../../storage/payment-evidence';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

/** A staff row's display name, for the screens. */
function membership_staff_name(string $id): string {
    if ($id === '' || $id === 'paystack') return $id === 'paystack' ? 'Paystack' : '';
    $r = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$id]);
    return $r ? (string)$r['fullName'] : $id;
}

function membership_invoice_row(array $inv, array $members, array $pending, string $me = ''): array {
    $m = $members[(string)$inv['memberId']] ?? [];
    $op = $pending[(string)$inv['invoiceId']] ?? null;
    /* The verifier types the reference and amount from the STATEMENT; shown the
       recorded reference first, a verifier could copy it instead of checking.
       Only the person who recorded a waiting claim sees its reference. */
    $hideRef = $op && (string)$op['status'] === 'pending' && (string)$op['recordedBy'] !== $me;
    $prior = $op ? (int)(db_row("SELECT COUNT(*) c FROM offline_payments WHERE referenceKey = ? AND status = 'rejected' AND paymentId <> ?", [(string)$op['referenceKey'], (string)$op['paymentId']])['c'] ?? 0) : 0;
    return [
        'invoiceId' => (string)$inv['invoiceId'], 'memberId' => (string)$inv['memberId'],
        'name' => (string)($m['fullName'] ?? ''), 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
        'total' => (int)$inv['total'], 'status' => (string)$inv['status'], 'startDate' => (string)$inv['startDate'],
        'purpose' => (string)($inv['purpose'] ?? 'joining'),
        'items' => membership_items($inv), 'createdAt' => (string)$inv['createdAt'], 'sentTo' => $inv['sentTo'] ? mask_email((string)$inv['sentTo']) : '', 'sentAt' => (string)$inv['sentAt'],
        'paidVia' => (string)$inv['paidVia'], 'paidAt' => (string)$inv['paidAt'], 'receiptNo' => (string)$inv['receiptNo'],
        'receiptUrl' => (string)$inv['status'] === 'paid' ? membership_receipt_url($inv) : '', 'payUrl' => (string)$inv['status'] === 'open' ? membership_pay_url($inv) : '',
        'invoiceUrl' => doc_view_url(doc_for_invoice($inv)),
        'offline' => $op ? [
            'paymentId' => (string)$op['paymentId'], 'status' => (string)$op['status'], 'amount' => (int)$op['amount'], 'method' => (string)$op['method'],
            'methodLabel' => MPAY_METHODS[(string)$op['method']] ?? '', 'payerName' => (string)$op['payerName'], 'bankName' => (string)$op['bankName'],
            'reference' => $hideRef ? '' : (string)$op['reference'], 'referenceHidden' => $hideRef, 'priorRejections' => $prior, 'paidOn' => (string)$op['paidOn'], 'note' => (string)$op['note'], 'evidenceType' => (string)$op['evidenceType'],
            'recordedBy' => (string)$op['recordedBy'], 'recordedByName' => membership_staff_name((string)$op['recordedBy']), 'recordedAt' => (string)$op['recordedAt'],
            'verifiedBy' => (string)$op['verifiedBy'], 'verifiedByName' => membership_staff_name((string)$op['verifiedBy']), 'verifiedAt' => (string)$op['verifiedAt'],
            'rejectReason' => (string)$op['rejectReason'],
        ] : null,
    ];
}

/** admin.membership.invoices — every joining invoice, newest first, scoped to the operator's centres. */
function admin_membership_invoices(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $status = (string)($p['status'] ?? '');
    /* Scope is applied IN the query, above the row cap — a filter applied to
       the drawn rows filters the page (CLAUDE.md §6) — and the counts are the
       operator's own centres', not the organisation's. */
    $scope = admin_centre_names_in_scope($g['requester']);
    $conds = []; $args = [];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'invoices' => [], 'counts' => [], 'terms' => membership_fee_terms(), 'bank' => membership_pay_settings(), 'methods' => MPAY_METHODS, 'me' => (string)$g['requester']['memberId'], 'evidenceMax' => MPAY_EVIDENCE_MAX];
        $conds[] = 'memberId IN (SELECT memberId FROM members WHERE centre IN (' . implode(',', array_fill(0, count($scope), '?')) . '))';
        $args = array_merge($args, $scope);
    }
    $scopeSql = $conds ? ' AND ' . implode(' AND ', $conds) : '';
    $scopeArgs = $args;
    if (in_array($status, ['open', 'paid', 'void'], true)) { $conds[] = 'status = ?'; $args[] = $status; }
    elseif ($status === 'pending') $conds[] = "status = 'open' AND invoiceId IN (SELECT invoiceId FROM offline_payments WHERE status = 'pending')";
    $where = $conds ? 'WHERE ' . implode(' AND ', $conds) : '';
    $rows = db_all("SELECT * FROM membership_invoices $where ORDER BY id DESC LIMIT " . MPAY_LIST_MAX, $args);
    $ids = array_values(array_unique(array_map(static fn($r) => (string)$r['memberId'], $rows)));
    $members = [];
    if ($ids) foreach (db_all('SELECT memberId, fullName, displayId, centre FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $m) $members[(string)$m['memberId']] = $m;
    $inv = array_values(array_unique(array_map(static fn($r) => (string)$r['invoiceId'], $rows)));
    $pending = [];
    // The latest claim per invoice: pending first, else the newest (so a rejection is visible).
    if ($inv) foreach (db_all('SELECT * FROM offline_payments WHERE invoiceId IN (' . implode(',', array_fill(0, count($inv), '?')) . ') ORDER BY id', $inv) as $op) {
        $k = (string)$op['invoiceId'];
        if (!isset($pending[$k]) || (string)$pending[$k]['status'] !== 'pending') $pending[$k] = $op;
    }
    $me = (string)$g['requester']['memberId'];
    $out = array_map(static fn($r) => membership_invoice_row($r, $members, $pending, $me), $rows);
    /* Money that arrived and could not be applied (a Paystack payment for an
       invoice since voided or paid another way, or an amount that does not
       match) — never silently dropped. In scope only. */
    $alerts = [];
    unapplied_backfill();
    foreach (db_all("SELECT * FROM unapplied_payments WHERE status = 'open' ORDER BY id DESC LIMIT 200") as $a) {
        if ($scope !== null && !admin_centre_allowed($g['requester'], (string)(db_row('SELECT centre FROM members WHERE memberId = ? LIMIT 1', [(string)$a['memberId']])['centre'] ?? ''))) continue;
        $alerts[] = ['id' => (int)$a['id'], 'kind' => (string)$a['cause'], 'memberId' => (string)$a['memberId'], 'at' => (string)$a['createdAt'],
            'invoiceId' => (string)$a['invoiceId'], 'reference' => (string)$a['reference'], 'amount' => (int)$a['amount'],
            'fullName' => (string)(db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [(string)$a['memberId']])['fullName'] ?? '')];
    }
    $counts = [];
    foreach (db_all('SELECT status, COUNT(*) c FROM membership_invoices WHERE 1 = 1' . $scopeSql . ' GROUP BY status', $scopeArgs) as $c) $counts[(string)$c['status']] = (int)$c['c'];
    $counts['pending'] = (int)(db_row("SELECT COUNT(*) c FROM offline_payments WHERE status = 'pending' AND invoiceId IN (SELECT invoiceId FROM membership_invoices WHERE 1 = 1" . $scopeSql . ')', $scopeArgs)['c'] ?? 0);
    $pb = membership_bank_pending();
    return ['ok' => true, 'invoices' => $out, 'counts' => $counts, 'terms' => membership_fee_terms(), 'bank' => membership_pay_settings(),
            'bankPending' => $pb ? ['bank' => $pb['bank'], 'by' => (string)$pb['by'], 'byName' => membership_staff_name((string)$pb['by']), 'at' => (string)$pb['at']] : null,
            'alerts' => $alerts, 'methods' => MPAY_METHODS, 'me' => $me, 'evidenceMax' => MPAY_EVIDENCE_MAX];
}

function membership_invoice_for_staff(array $g, string $invoiceId): array {
    $inv = membership_invoice_by('invoiceId', $invoiceId);
    if (!$inv) return ['ok' => false, 'error' => 'not_found'];
    $sg = fees_scope_gate($g['requester'], (string)$inv['memberId']); if (!$sg['ok']) return $sg;
    return ['ok' => true, 'invoice' => $inv];
}

/** admin.membership.invoice.create — the joining invoice for a member already on the roll (or a new start date). */
function admin_membership_invoice_create(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $start = trim((string)($p['startDate'] ?? ''));
    if ($start !== '' && !membership_start_ok($start)) return ['ok' => false, 'error' => 'bad_start', 'detail' => 'The start date must be a real date within a month before or three months after today.'];
    $r = membership_invoice_create($m, (string)$g['requester']['memberId'], 0, $start);
    if (empty($r['ok'])) return $r;
    $sent = !empty($r['existed']) || empty($p['send']) ? null : membership_invoice_send($r['invoice'], $m);
    return ['ok' => true, 'invoiceId' => (string)$r['invoice']['invoiceId'], 'existed' => !empty($r['existed']), 'sent' => $sent];
}
function membership_start_ok(string $d): bool {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $x) || !checkdate((int)$x[2], (int)$x[3], (int)$x[1])) return false;
    $t = strtotime($d . ' UTC'); $now = time();
    return $t >= $now - 32 * 86400 && $t <= $now + 92 * 86400;
}

/** admin.membership.invoice.resend — email the link again (only while unpaid and with no claim pending). */
function admin_membership_invoice_resend(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $r = membership_invoice_for_staff($g, (string)($p['invoiceId'] ?? '')); if (empty($r['ok'])) return $r;
    $inv = $r['invoice'];
    if (db_row("SELECT id FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$inv['invoiceId']])) return ['ok' => false, 'error' => 'offline_pending', 'detail' => 'An offline payment is waiting to be verified. Verify or reject it first; the family must not be asked to pay twice.'];
    $s = membership_invoice_send($inv);
    audit('membership.invoice.resend', (string)$g['requester']['memberId'], (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'ok' => !empty($s['ok'])], (string)($p['ip'] ?? ''));
    return $s;
}

/** admin.membership.invoice.void — cancel an unpaid invoice, with a reason. */
function admin_membership_invoice_void(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $r = membership_invoice_for_staff($g, (string)($p['invoiceId'] ?? '')); if (empty($r['ok'])) return $r;
    $inv = $r['invoice'];
    if ((string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];
    $reason = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($reason) < MPAY_REASON_MIN) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why, in at least ' . MPAY_REASON_MIN . ' characters.'];
    if (db_row("SELECT id FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$inv['invoiceId']])) return ['ok' => false, 'error' => 'offline_pending'];
    db_update('membership_invoices', ['status' => 'void', 'voidReason' => mb_substr($reason, 0, 250)], ['id' => $inv['id']]);
    audit('membership.invoice.void', (string)$g['requester']['memberId'], (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── The account families pay into ────────────────────────────────────────

   Whoever can change it can send every family's money to themselves, so one
   person cannot. Changing it takes the Fees AND Settings permissions, across
   the whole organisation (no centre scope), and is a PROPOSAL until a second
   such person confirms it by retyping the new account number. Every holder
   of the Fees permission is told, so a change nobody expected is seen the day
   it is made. Setting the details the first time, when there is no account to
   divert from, is one step. */

/** Who may propose or confirm a change of account: fees + settings, unscoped. */
function membership_bank_gate(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    if (!in_array('settings', member_effective_caps($g['requester']), true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'Changing the bank account takes the Settings permission as well as Fees.'];
    if (admin_centre_names_in_scope($g['requester']) !== null) return ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'The account is the whole organisation’s; a centre-scoped account cannot change it.'];
    return $g;
}
function membership_bank_pending(): ?array {
    $s = setting_get('membership_pay_pending');
    return is_array($s) && !empty($s['bank']['accountNumber']) ? $s : null;
}
/** Tell everybody who holds Fees that the account changed (or that a change is waiting). */
function membership_bank_notify(string $subject, string $body, string $except = ''): int {
    $n = 0;
    foreach (db_all("SELECT memberId, fullName, email, role, capsExtra FROM members WHERE status = 'active' AND email <> '' LIMIT 500") as $m) {
        if ((string)$m['memberId'] === $except || !in_array('fees', member_effective_caps($m), true)) continue;
        if (function_exists('send_mail') && send_mail((string)$m['email'], $subject, email_template(['title' => $subject, 'intro' => $body]))) $n++;
    }
    return $n;
}

/** admin.membership.bank.set — propose new transfer details (or set them the first time). */
function admin_membership_bank_set(array $p): array {
    $g = membership_bank_gate($p); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $d = is_array($p['bank'] ?? null) ? $p['bank'] : [];
    $num = preg_replace('/\D+/', '', (string)($d['accountNumber'] ?? ''));
    if (strlen($num) !== 10) return ['ok' => false, 'error' => 'bad_account_number', 'detail' => 'A Nigerian account number (NUBAN) is 10 digits.'];
    $clean = ['bankName' => mb_substr(trim((string)($d['bankName'] ?? '')), 0, 80), 'accountName' => mb_substr(trim((string)($d['accountName'] ?? '')), 0, 120), 'accountNumber' => $num];
    if (mb_strlen($clean['bankName']) < 2 || mb_strlen($clean['accountName']) < 3) return ['ok' => false, 'error' => 'bank_required', 'detail' => 'The bank and the account name.'];
    $cur = membership_pay_settings();
    if ($cur['accountNumber'] === '') {
        setting_set('membership_pay', $clean, $by);
        audit('membership.bank.set', $by, '', $clean + ['first' => true], (string)($p['ip'] ?? ''));
        membership_bank_notify('NGG payments: bank details set', 'The account printed on joining invoices is now ' . $clean['bankName'] . ' · ' . $clean['accountName'] . ' · ' . $clean['accountNumber'] . ', set by ' . membership_staff_name($by) . '.', $by);
        if (function_exists('cache_invalidate')) cache_invalidate('catalogue');
        return ['ok' => true, 'applied' => true, 'bank' => membership_pay_settings()];
    }
    if ($clean === $cur) return ['ok' => true, 'unchanged' => true, 'bank' => $cur];
    setting_set('membership_pay_pending', ['bank' => $clean, 'by' => $by, 'at' => now_iso()], $by);
    audit('membership.bank.proposed', $by, '', $clean + ['from' => $cur['accountNumber']], (string)($p['ip'] ?? ''));
    membership_bank_notify('NGG payments: a change of bank account is waiting', membership_staff_name($by) . ' asked to change the account on joining invoices from ' . $cur['accountNumber'] . ' to ' . $clean['bankName'] . ' · ' . $clean['accountName'] . ' · ' . $clean['accountNumber'] . '. It takes effect only when another member of staff with the Fees and Settings permissions confirms it in Control Room → Money → Membership payments. If you did not expect this, cancel it there.', $by);
    return ['ok' => true, 'applied' => false, 'pending' => membership_bank_pending(), 'bank' => $cur];
}

/** admin.membership.bank.confirm — a second person retypes the new account number, and it applies. */
function admin_membership_bank_confirm(array $p): array {
    $g = membership_bank_gate($p); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $pend = membership_bank_pending();
    if (!$pend) return ['ok' => false, 'error' => 'nothing_pending'];
    if ($by === (string)$pend['by']) return ['ok' => false, 'error' => 'needs_second_person', 'detail' => 'You proposed this change. Another member of staff with the Fees and Settings permissions must confirm it.'];
    if (preg_replace('/\D+/', '', (string)($p['confirmAccountNumber'] ?? '')) !== (string)$pend['bank']['accountNumber']) {
        audit('membership.bank.confirm_mismatch', $by, '', [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'account_mismatch', 'detail' => 'The account number you typed is not the one proposed. Check it with the bank’s own letter or statement.'];
    }
    $from = membership_pay_settings();
    setting_set('membership_pay', $pend['bank'], $by);
    setting_set('membership_pay_pending', [], $by);
    audit('membership.bank.set', $by, '', $pend['bank'] + ['proposedBy' => $pend['by'], 'from' => $from['accountNumber']], (string)($p['ip'] ?? ''));
    membership_bank_notify('NGG payments: the bank account changed', 'Joining invoices now show ' . $pend['bank']['bankName'] . ' · ' . $pend['bank']['accountName'] . ' · ' . $pend['bank']['accountNumber'] . ' (was ' . $from['accountNumber'] . '). Proposed by ' . membership_staff_name((string)$pend['by']) . ', confirmed by ' . membership_staff_name($by) . '.');
    if (function_exists('cache_invalidate')) cache_invalidate('catalogue');
    return ['ok' => true, 'applied' => true, 'bank' => membership_pay_settings()];
}

/** admin.membership.bank.cancel — withdraw a proposed change (anyone who may make one). */
function admin_membership_bank_cancel(array $p): array {
    $g = membership_bank_gate($p); if (!$g['ok']) return $g;
    $pend = membership_bank_pending();
    if (!$pend) return ['ok' => true, 'unchanged' => true];
    setting_set('membership_pay_pending', [], (string)$g['requester']['memberId']);
    audit('membership.bank.cancelled', (string)$g['requester']['memberId'], '', ['proposedBy' => $pend['by'], 'accountNumber' => $pend['bank']['accountNumber']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** A reference as it is compared: upper case, letters and digits only. */
function membership_ref_key(string $ref): string { return strtoupper(preg_replace('/[^A-Za-z0-9]+/', '', $ref)); }

/** Decode and check an evidence file: a real image or PDF, within the size bound. */
function membership_evidence_decode(string $dataUrl): array {
    if (!preg_match('#^data:([a-z]+/[a-z.+-]+);base64,(.+)$#s', $dataUrl, $mm)) return ['ok' => false, 'error' => 'evidence_required'];
    $bytes = base64_decode($mm[2], true);
    if ($bytes === false || $bytes === '') return ['ok' => false, 'error' => 'evidence_unreadable'];
    if (strlen($bytes) > MPAY_EVIDENCE_MAX) return ['ok' => false, 'error' => 'evidence_too_large', 'detail' => 'At most ' . (MPAY_EVIDENCE_MAX >> 20) . ' MB.'];
    // The bytes decide the type, not the label the browser put on them.
    $type = '';
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) $type = 'image/jpeg';
    elseif (strncmp($bytes, "\x89PNG\r\n\x1A\n", 8) === 0) $type = 'image/png';
    elseif (strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') $type = 'image/webp';
    elseif (strncmp($bytes, '%PDF-', 5) === 0) $type = 'application/pdf';
    if ($type === '') return ['ok' => false, 'error' => 'evidence_type', 'detail' => 'A photo (JPG, PNG, WebP) or a PDF of the slip, receipt or bank alert.'];
    if ($type !== 'application/pdf') {
        $info = @getimagesizefromstring($bytes);
        if (!$info || $info[0] < 200 || $info[1] < 200) return ['ok' => false, 'error' => 'evidence_too_small', 'detail' => 'The picture is too small to read. Photograph the whole slip.'];
    }
    return ['ok' => true, 'bytes' => $bytes, 'type' => $type, 'sha' => hash('sha256', $bytes)];
}

/**
 * admin.membership.offline.record — record an offline payment, with evidence,
 * as a claim awaiting a second person's check.
 */
function admin_membership_offline_record(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $r = membership_invoice_for_staff($g, (string)($p['invoiceId'] ?? '')); if (empty($r['ok'])) return $r;
    $inv = $r['invoice'];
    if ((string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open', 'detail' => 'This invoice is ' . $inv['status'] . '.'];
    if ($by === (string)$inv['memberId']) return ['ok' => false, 'error' => 'own_account'];
    if (db_row("SELECT id FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$inv['invoiceId']])) return ['ok' => false, 'error' => 'offline_pending', 'detail' => 'A payment for this invoice is already waiting to be verified.'];

    // Validate the whole claim before anything is written.
    $method = (string)($p['method'] ?? '');
    if (!isset(MPAY_METHODS[$method])) return ['ok' => false, 'error' => 'bad_method'];
    $amount = fees_money($p['amount'] ?? null, 0);
    if ($amount !== (int)$inv['total']) return ['ok' => false, 'error' => 'amount_mismatch', 'detail' => 'The invoice is ' . fees_money_text((int)$inv['total']) . '. Record the payment only when that amount has been paid in full.'];
    $payer = trim((string)($p['payerName'] ?? ''));
    if (mb_strlen($payer) < 3 || mb_strlen($payer) > 160) return ['ok' => false, 'error' => 'payer_required', 'detail' => 'The name on the slip or the receipt.'];
    $bank = mb_substr(trim((string)($p['bankName'] ?? '')), 0, 120);
    if ($method !== 'cash' && mb_strlen($bank) < 2) return ['ok' => false, 'error' => 'bank_required', 'detail' => 'Which bank the money went through.'];
    $reference = mb_substr(trim((string)($p['reference'] ?? '')), 0, 120);
    $refKey = membership_ref_key($reference);
    if (strlen($refKey) < MPAY_REF_MIN) return ['ok' => false, 'error' => 'reference_required', 'detail' => $method === 'cash' ? 'The number on the NGG cash receipt you wrote.' : 'The transaction reference or session ID on the slip or alert.'];
    $paidOn = trim((string)($p['paidOn'] ?? ''));
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $paidOn, $dm) || !checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1])) return ['ok' => false, 'error' => 'bad_date'];
    if ($paidOn > gmdate('Y-m-d', time() + 86400)) return ['ok' => false, 'error' => 'date_in_future'];
    if ($paidOn < gmdate('Y-m-d', (int)strtotime(substr((string)$inv['createdAt'], 0, 10) . ' UTC') - 86400)) return ['ok' => false, 'error' => 'date_before_invoice', 'detail' => 'A payment dated before the invoice existed cannot be for it.'];
    $ev = membership_evidence_decode((string)($p['evidence'] ?? ''));
    if (empty($ev['ok'])) return $ev;

    // Once, ever: the evidence file and the reference.
    if (db_row('SELECT id FROM offline_payments WHERE evidenceSha256 = ? LIMIT 1', [$ev['sha']])) {
        audit('membership.offline.reused_evidence', $by, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId']], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'evidence_reused', 'detail' => 'This exact file has already been used as evidence for a payment.'];
    }
    /* A reference that was REJECTED is not free again: a claim turned down
       because the money never arrived must not come back next week with a new
       photo. It can be recorded again only on purpose (`resubmit`), and the
       verifier then sees how many times it was refused before. */
    $rej = db_row("SELECT paymentId, rejectReason FROM offline_payments WHERE referenceKey = ? AND status = 'rejected' ORDER BY id DESC LIMIT 1", [$refKey]);
    if ($rej && empty($p['resubmit'])) {
        audit('membership.offline.rejected_reference', $by, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $reference, 'rejected' => $rej['paymentId']], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'reference_rejected', 'detail' => 'A payment with the reference ' . $reference . ' was rejected before (' . $rej['paymentId'] . ': ' . $rej['rejectReason'] . '). Record it again only if you are sure, and say why in the note.'];
    }
    if ($rej && mb_strlen(trim((string)($p['note'] ?? ''))) < MPAY_REASON_MIN) return ['ok' => false, 'error' => 'note_required', 'detail' => 'Say in the note why a rejected reference is being recorded again.'];
    $dupe = db_row("SELECT invoiceId FROM offline_payments WHERE referenceKey = ? AND status <> 'rejected' LIMIT 1", [$refKey]);
    if (!$dupe) foreach (db_all("SELECT reference FROM member_ledger WHERE kind = 'payment' AND reference <> ''") as $lr) if (membership_ref_key((string)$lr['reference']) === $refKey) { $dupe = ['invoiceId' => 'the ledger']; break; }
    if ($dupe) {
        audit('membership.offline.reused_reference', $by, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $reference], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'reference_reused', 'detail' => 'The reference ' . $reference . ' is already recorded against ' . $dupe['invoiceId'] . '.'];
    }

    $file = $ev['sha'] . '.' . MPAY_EVIDENCE_TYPES[$ev['type']];
    if (@file_put_contents(membership_evidence_dir() . '/' . $file, $ev['bytes']) === false) return ['ok' => false, 'error' => 'evidence_not_saved'];
    $row = ['paymentId' => 'NGG-OFP-' . strtoupper(rand_hex(5)), 'invoiceId' => (string)$inv['invoiceId'], 'memberId' => (string)$inv['memberId'],
        'amount' => $amount, 'method' => $method, 'payerName' => $payer, 'bankName' => $bank, 'reference' => $reference, 'referenceKey' => $refKey,
        'paidOn' => $paidOn, 'evidenceSha256' => $ev['sha'], 'evidenceFile' => $file, 'evidenceType' => $ev['type'], 'evidenceBytes' => strlen($ev['bytes']),
        'note' => mb_substr(trim((string)($p['note'] ?? '')), 0, 500), 'status' => 'pending', 'recordedBy' => $by, 'recordedAt' => now_iso()];
    db_insert('offline_payments', $row);
    $ack = doc_ack_issue($row);   // the family's acknowledgement: not a receipt, no receipt number (documents.php)
    audit('membership.offline.record', $by, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'paymentId' => $row['paymentId'], 'amount' => $amount, 'method' => $method, 'reference' => $reference, 'evidence' => $ev['sha']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'paymentId' => $row['paymentId'], 'status' => 'pending', 'ackUrl' => doc_view_url($ack)];
}

function membership_offline_for_staff(array $g, string $paymentId): array {
    $op = db_row('SELECT * FROM offline_payments WHERE paymentId = ? LIMIT 1', [$paymentId]);
    if (!$op) return ['ok' => false, 'error' => 'not_found'];
    $sg = fees_scope_gate($g['requester'], (string)$op['memberId']); if (!$sg['ok']) return $sg;
    return ['ok' => true, 'payment' => $op];
}

/**
 * admin.membership.offline.verify — a second person checks the claim against
 * the bank statement or the receipt book, and the invoice is paid.
 */
function admin_membership_offline_verify(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $r = membership_offline_for_staff($g, (string)($p['paymentId'] ?? '')); if (empty($r['ok'])) return $r;
    $op = $r['payment'];
    if ((string)$op['status'] !== 'pending') return ['ok' => false, 'error' => 'not_pending'];
    if ($by === (string)$op['recordedBy']) return ['ok' => false, 'error' => 'needs_second_person', 'detail' => 'You recorded this payment. Another member of staff with the Fees permission must verify it.'];
    if ($by === (string)$op['memberId']) return ['ok' => false, 'error' => 'own_account'];
    if (empty($p['checked'])) return ['ok' => false, 'error' => 'not_checked', 'detail' => 'Confirm that you checked the money arrived (bank statement, alert or the cash book).'];
    if (membership_ref_key((string)($p['confirmReference'] ?? '')) !== (string)$op['referenceKey']) {
        audit('membership.offline.verify_mismatch', $by, (string)$op['memberId'], ['paymentId' => $op['paymentId'], 'field' => 'reference'], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'reference_mismatch', 'detail' => 'The reference you typed from the statement does not match the one recorded.'];
    }
    if (fees_money($p['confirmAmount'] ?? null, -1) !== (int)$op['amount']) {
        audit('membership.offline.verify_mismatch', $by, (string)$op['memberId'], ['paymentId' => $op['paymentId'], 'field' => 'amount'], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'amount_mismatch', 'detail' => 'The amount you typed does not match the one recorded.'];
    }
    $inv = membership_invoice_by('invoiceId', (string)$op['invoiceId']);
    if (!$inv || (string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];
    /* Claimed, not just set: two staff verifying the same transfer at once both
       passed the `pending` check above. And reverted on ANY failure — settling
       throws when the ledger refuses the post or two receipts collide, and a
       throw used to leave the payment "verified" on an invoice still open, with
       nothing on the account and the guards that stop a second online payment
       no longer looking at it. */
    if (!db_exec("UPDATE offline_payments SET status = 'verified', verifiedBy = ?, verifiedAt = ? WHERE id = ? AND status = 'pending'", [$by, now_iso(), $op['id']]))
        return ['ok' => false, 'error' => 'not_pending'];
    $revert = static fn() => db_update('offline_payments', ['status' => 'pending', 'verifiedBy' => '', 'verifiedAt' => ''], ['id' => $op['id']]);
    try {
        $s = membership_settle((string)$op['invoiceId'], (string)$op['method'], (string)$op['reference'], $by, ['paymentId' => $op['paymentId'], 'recordedBy' => $op['recordedBy']]);
    } catch (Throwable $e) {
        $revert();
        error_log('[membership.offline.verify] ' . $op['paymentId'] . ': ' . $e->getMessage());
        return ['ok' => false, 'error' => 'settle_failed', 'detail' => 'The payment could not be applied to the invoice, so it is still waiting to be verified. Try again.'];
    }
    if (empty($s['ok'])) {
        $revert();
        return $s;
    }
    doc_ack_close((string)$op['paymentId'], 'verified', (string)$s['invoice']['receiptNo']);
    audit('membership.offline.verify', $by, (string)$op['memberId'], ['paymentId' => $op['paymentId'], 'invoiceId' => $op['invoiceId']], (string)($p['ip'] ?? ''));
    $rd = doc_for_receipt($s['invoice']);
    return ['ok' => true, 'receiptNo' => (string)$s['invoice']['receiptNo'], 'receiptUrl' => $rd ? doc_view_url($rd) : membership_receipt_url($s['invoice']), 'receipt' => $s['receipt'] ?? null];
}

/** admin.membership.offline.reject — the claim does not hold up; say why. The invoice stays open. */
function admin_membership_offline_reject(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $r = membership_offline_for_staff($g, (string)($p['paymentId'] ?? '')); if (empty($r['ok'])) return $r;
    $op = $r['payment'];
    if ((string)$op['status'] !== 'pending') return ['ok' => false, 'error' => 'not_pending'];
    $reason = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($reason) < MPAY_REASON_MIN) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why, in at least ' . MPAY_REASON_MIN . ' characters.'];
    db_update('offline_payments', ['status' => 'rejected', 'verifiedBy' => $by, 'verifiedAt' => now_iso(), 'rejectReason' => mb_substr($reason, 0, 500)], ['id' => $op['id']]);
    doc_ack_close((string)$op['paymentId'], 'rejected');
    audit('membership.offline.reject', $by, (string)$op['memberId'], ['paymentId' => $op['paymentId'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** The evidence file for a claim, for the admin endpoint to stream. */
function admin_membership_evidence(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $r = membership_offline_for_staff($g, (string)($p['paymentId'] ?? '')); if (empty($r['ok'])) return $r;
    $op = $r['payment'];
    $path = membership_evidence_dir() . '/' . basename((string)$op['evidenceFile']);
    if (!is_file($path)) return ['ok' => false, 'error' => 'evidence_missing'];
    // The file on disk must still be the file that was recorded.
    if (hash_file('sha256', $path) !== (string)$op['evidenceSha256']) return ['ok' => false, 'error' => 'evidence_altered'];
    audit('membership.offline.evidence_viewed', (string)$g['requester']['memberId'], (string)$op['memberId'], ['paymentId' => $op['paymentId']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'path' => $path, 'type' => (string)$op['evidenceType']];
}

/* ── Money that arrived and could not be applied ─────────────────────────────
   A Paystack payment for an invoice voided or paid another way meanwhile, or
   for an amount its invoice does not match. It used to live only in the audit
   log — shown as the latest thirty, with no way to say it had been dealt with.
   One row per payment reference (unique), and a person resolves it: applied
   to the family's account, refunded (at Paystack), or dismissed with a reason. */
function unapplied_record(string $reference, string $cause, array $inv, int $amount, string $currency): void {
    try {
        db_insert('unapplied_payments', ['reference' => $reference, 'source' => 'paystack', 'cause' => $cause, 'invoiceId' => (string)$inv['invoiceId'],
            'memberId' => (string)$inv['memberId'], 'amount' => max(0, $amount), 'currency' => strtoupper($currency ?: 'NGN'), 'status' => 'open', 'createdAt' => now_iso()]);
    } catch (\Throwable $e) {
        if (!(function_exists('fees_is_duplicate') && fees_is_duplicate($e))) error_log('[unapplied] ' . $e->getMessage());
    }
}

/** The audit-log rows from before the table existed, brought in once each (the reference is unique). */
function unapplied_backfill(): void {
    if (setting_raw('unapplied_backfilled') !== null) return;
    foreach (db_all("SELECT event, subject, meta, at FROM audit_log WHERE event IN ('membership.paystack.unapplied', 'membership.paystack.mismatch') ORDER BY id") as $a) {
        $meta = json_decode((string)$a['meta'], true) ?: [];
        if ((string)($meta['reference'] ?? '') === '') continue;
        try {
            db_insert('unapplied_payments', ['reference' => (string)$meta['reference'], 'source' => 'paystack',
                'cause' => $a['event'] === 'membership.paystack.mismatch' ? 'mismatch' : 'unapplied', 'invoiceId' => (string)($meta['invoiceId'] ?? ''),
                'memberId' => (string)$a['subject'], 'amount' => (int)round(((int)($meta['amount'] ?? 0)) / 100), 'currency' => strtoupper((string)($meta['currency'] ?? 'NGN')) ?: 'NGN',
                'status' => 'open', 'createdAt' => (string)$a['at']]);
        } catch (\Throwable $e) { /* already there */ }
    }
    setting_set('unapplied_backfilled', gmdate('c'), 'system');
}

/**
 * admin.fees.unapplied.resolve — {id, decision: apply|refund|dismiss, note}.
 * Apply posts the money to the family's account (once: the row's own key);
 * refund records that it was returned at Paystack; dismiss needs a reason.
 */
function admin_unapplied_resolve(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM unapplied_payments WHERE id = ? LIMIT 1', [(int)($p['id'] ?? 0)]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$row['memberId']]);
    if ($m && !admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$row['status'] !== 'open') return ['ok' => false, 'error' => 'already_resolved'];
    $action = (string)($p['decision'] ?? '');   // not `action`: the route spends that word on choosing the op
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 240));
    $by = (string)($g['requester']['memberId'] ?? '');
    if (!in_array($action, ['apply', 'refund', 'dismiss'], true)) return ['ok' => false, 'error' => 'bad_action'];
    if ($action !== 'apply' && strlen($note) < 3) return ['ok' => false, 'error' => 'reason_required'];
    if ($by !== '' && $by === (string)$row['memberId']) return ['ok' => false, 'error' => 'own_account'];
    $entry = '';
    if ($action === 'apply') {
        if (!$m) return ['ok' => false, 'error' => 'not_found', 'detail' => 'The member this payment was for no longer exists — refund it instead.'];
        $e = fees_post((string)$row['memberId'], 'payment', (int)$row['amount'], ['periodKey' => 'unapplied:' . (int)$row['id'], 'method' => 'paystack',
            'reference' => (string)$row['reference'], 'note' => 'Paystack payment applied by hand' . ($note !== '' ? ' — ' . $note : ''), 'by' => $by]);
        if (!$e) return ['ok' => false, 'error' => 'post_failed'];
        $entry = (string)$e['entryId'];
    }
    db_update('unapplied_payments', ['status' => ['apply' => 'applied', 'refund' => 'refunded', 'dismiss' => 'dismissed'][$action], 'note' => $note,
        'ledgerEntryId' => $entry, 'resolvedAt' => now_iso(), 'resolvedBy' => $by], ['id' => (int)$row['id']]);
    audit('fees.unapplied.' . $action, $by, (string)$row['memberId'], ['reference' => (string)$row['reference'], 'amount' => (int)$row['amount'], 'note' => $note], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => ['apply' => 'applied', 'refund' => 'refunded', 'dismiss' => 'dismissed'][$action], 'entryId' => $entry];
}
