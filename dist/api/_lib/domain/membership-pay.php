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
    $have = db_row("SELECT * FROM membership_invoices WHERE memberId = ? AND status IN ('open','paid') ORDER BY id DESC LIMIT 1", [(string)$m['memberId']]);
    if ($have) return ['ok' => true, 'invoice' => $have, 'existed' => true];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) $start = substr((string)($m['joinDate'] ?? ''), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) $start = gmdate('Y-m-d');
    $items = membership_invoice_items($m, $start);
    $total = array_sum(array_map(static fn($i) => (int)$i['amount'], $items));
    if ($total <= 0) return ['ok' => false, 'error' => 'nothing_to_pay'];
    $row = [
        'invoiceId' => 'NGG-INV-' . strtoupper(rand_hex(5)),
        'memberId' => (string)$m['memberId'], 'applicationId' => $applicationId,
        'payToken' => rand_hex(20), 'items' => json_encode($items, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'total' => $total, 'currency' => (string)$terms['currency'], 'startDate' => $start,
        'status' => 'open', 'createdBy' => substr($by, 0, 64), 'createdAt' => now_iso(),
    ];
    db_insert('membership_invoices', $row);
    audit('membership.invoice.create', $by, (string)$m['memberId'], ['invoiceId' => $row['invoiceId'], 'total' => $total, 'start' => $start]);
    return ['ok' => true, 'invoice' => membership_invoice_by('invoiceId', $row['invoiceId'])];
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
    $body = '<p style="margin:0 0 14px">' . esc_html($first) . '’s place in Next Generation Genius is confirmed. To complete membership, please pay the joining invoice below.</p>'
        . membership_items_html($inv)
        . '<p style="margin:16px 0 0;color:#5a6488;font-size:13.5px">The commitment fee for the first month is charged only for the meeting days left from the start date, ' . esc_html(gmdate('j F Y', (int)strtotime($inv['startDate'] . ' UTC'))) . '. From the next month it is charged in full.</p>'
        . ($bank ? '<p style="margin:14px 0 0;font-size:14px"><b>Prefer to pay by transfer?</b> ' . esc_html($bank['bankName']) . ' · ' . esc_html($bank['accountNumber']) . ' · ' . esc_html($bank['accountName'])
            . '. Use <b>' . esc_html($inv['invoiceId']) . '</b> as the narration and keep the slip — our team checks it and sends the receipt. Please do not pay twice.</p>' : '')
        . '<p style="margin:14px 0 0;font-size:13px;color:#5a6488">Invoice ' . esc_html($inv['invoiceId']) . ' · member ' . esc_html((string)($m['displayId'] ?: $m['memberId'])) . '</p>';
    $ok = @send_mail($to, 'Complete ' . $first . '’s NGG membership — ' . fees_money_text((int)$inv['total']), email_template([
        'title' => 'Welcome to NGG — one step left',
        'intro' => 'Thank you for choosing Next Generation Genius.',
        'bodyHtml' => $body,
        'ctaLabel' => $terms['paystack'] ? 'Pay ' . fees_money_text((int)$inv['total']) . ' securely' : 'View the invoice',
        'ctaUrl' => membership_pay_url($inv),
        'footNote' => 'This link is private to your family. Payment is processed by Paystack; we never see card details.',
    ]));
    if ($ok) db_update('membership_invoices', ['sentTo' => $to, 'sentAt' => now_iso()], ['id' => $inv['id']]);
    return ['ok' => (bool)$ok, 'to' => mask_email($to), 'error' => $ok ? null : 'send_failed'];
}

/* ── Settling: the one place an invoice becomes paid ─────────────────────── */

/** The next receipt number: NGG-RCT-<year>-<serial>, minted from the highest serial, never a count. */
function membership_receipt_no(): string {
    $y = gmdate('Y');
    $hi = 0;
    foreach (db_all("SELECT receiptNo FROM membership_invoices WHERE receiptNo LIKE ?", ['NGG-RCT-' . $y . '-%']) as $r) {
        $n = (int)substr((string)$r['receiptNo'], strlen('NGG-RCT-' . $y . '-'));
        if ($n > $hi) $hi = $n;
    }
    return 'NGG-RCT-' . $y . '-' . str_pad((string)($hi + 1), 5, '0', STR_PAD_LEFT);
}

/**
 * Mark an invoice paid: its charges and the payment on the ledger, a receipt,
 * and the family thanked. Idempotent — a webhook and a callback racing, or a
 * verifier pressing twice, settle once.
 */
function membership_settle(string $invoiceId, string $via, string $reference, string $by, array $extra = []): array {
    $res = db_tx(static function () use ($invoiceId, $via, $reference, $by, $extra) {
        $inv = membership_invoice_by('invoiceId', $invoiceId);
        if (!$inv) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$inv['status'] === 'paid') return ['ok' => true, 'already' => true, 'invoice' => $inv];
        if ((string)$inv['status'] !== 'open') return ['ok' => false, 'error' => 'not_open'];
        $memberId = (string)$inv['memberId'];
        foreach (membership_items($inv) as $it) {
            fees_post($memberId, (string)$it['kind'], (int)$it['amount'], ['periodKey' => (string)$it['periodKey'], 'note' => (string)$it['label'], 'by' => 'invoice:' . $invoiceId]);
        }
        $credit = fees_post($memberId, 'payment', (int)$inv['total'], ['periodKey' => 'minv:' . $invoiceId,
            'note' => 'Joining invoice ' . $invoiceId . ' — ' . (MPAY_METHODS[$via] ?? ($via === 'paystack' ? 'Paystack' : $via)),
            'method' => $via, 'reference' => $reference, 'by' => $by]);
        if (!$credit) throw new RuntimeException('ledger_failed');
        db_update('membership_invoices', ['status' => 'paid', 'paidVia' => $via, 'paidAt' => now_iso(),
            'receiptNo' => membership_receipt_no(), 'receiptToken' => rand_hex(16)] + ($via === 'paystack' ? ['paystackRef' => $reference] : []), ['id' => $inv['id']]);
        audit('membership.invoice.paid', $by, $memberId, ['invoiceId' => $invoiceId, 'via' => $via, 'reference' => $reference, 'total' => (int)$inv['total']] + $extra);
        return ['ok' => true, 'invoice' => membership_invoice_by('invoiceId', $invoiceId)];
    });
    if (!empty($res['ok']) && empty($res['already'])) $res['receipt'] = membership_send_receipt($res['invoice']);
    return $res;
}

/** The receipt as a standalone, printable document. */
function membership_receipt_html(array $inv): string {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]) ?: [];
    $cfg = fees_settings();
    $c = function_exists('org_contact') ? org_contact() : [];
    $off = (string)$inv['paidVia'] !== 'paystack'
        ? db_row("SELECT * FROM offline_payments WHERE invoiceId = ? AND status = 'verified' ORDER BY id DESC LIMIT 1", [(string)$inv['invoiceId']]) : null;
    $method = (string)$inv['paidVia'] === 'paystack' ? 'Paystack (online)' : (MPAY_METHODS[(string)$inv['paidVia']] ?? (string)$inv['paidVia']);
    $ref = (string)$inv['paidVia'] === 'paystack' ? (string)$inv['paystackRef'] : (string)($off['reference'] ?? '');
    $row = static fn($k, $v) => '<tr><th>' . esc_html($k) . '</th><td>' . $v . '</td></tr>';
    $lines = '';
    foreach (membership_items($inv) as $it) $lines .= '<tr><td><b>' . esc_html($it['label']) . '</b>' . (!empty($it['detail']) ? '<div class="d">' . esc_html($it['detail']) . '</div>' : '') . '</td><td class="n">' . esc_html(fees_money_text((int)$it['amount'], $cfg)) . '</td></tr>';
    $paidAt = $inv['paidAt'] ? gmdate('j F Y, H:i', (int)strtotime((string)$inv['paidAt'])) . ' UTC' : '';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>Receipt ' . esc_html($inv['receiptNo']) . ' · Next Generation Genius</title><style>'
        . 'body{margin:0;background:#eef0f4;font:15px/1.55 Inter,"Segoe UI",Helvetica,Arial,sans-serif;color:#1c2442}'
        . '.r{max-width:720px;margin:32px auto;background:#fff;border-radius:16px;box-shadow:0 20px 50px -30px rgba(12,20,50,.35);overflow:hidden}'
        . '.h{background:#0c1432;color:#fff;padding:28px 36px;display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}'
        . '.h img{height:48px;background:#fff;border-radius:50%;padding:3px}.h b{display:block;font-size:20px}.h span{color:#c9cfe2;font-size:13px}'
        . '.paid{border:2px solid #2f9e44;color:#1d7a33;border-radius:8px;padding:6px 14px;font-weight:800;letter-spacing:.14em;background:#e9f7ee}'
        . '.b{padding:28px 36px}h1{font-size:22px;margin:0 0 4px}.mut{color:#5a6488;font-size:13.5px}'
        . 'table{width:100%;border-collapse:collapse;margin-top:18px}th{text-align:left;color:#5a6488;font-weight:500;padding:6px 0;width:38%;vertical-align:top}td{padding:6px 0;vertical-align:top}'
        . '.items td{border-bottom:1px solid #eceef2;padding:12px 0}.n{text-align:right;white-space:nowrap}.d{color:#5a6488;font-size:13px}'
        . '.tot td{font-size:18px;font-weight:800;border:0;padding-top:14px}.f{padding:20px 36px 30px;color:#5a6488;font-size:12.5px;border-top:1px solid #eceef2}'
        . '.pr{margin:0 36px 28px}.pr button{font:inherit;padding:10px 18px;border-radius:10px;border:1px solid #c9cfe2;background:#fff;cursor:pointer}'
        . '@media print{body{background:#fff}.r{box-shadow:none;margin:0}.pr{display:none}}'
        . '</style></head><body><main class="r">'
        . '<div class="h"><div style="display:flex;gap:14px;align-items:center"><img src="/assets/logo.png" alt=""><div><b>Next Generation Genius</b><span>Afrovanguard · Official receipt</span></div></div><div class="paid">PAID</div></div>'
        . '<div class="b"><h1>Receipt ' . esc_html($inv['receiptNo']) . '</h1><div class="mut">Thank you. This receipt confirms the payment below in full.</div>'
        . '<table>' . $row('Member', esc_html((string)($m['fullName'] ?? '')) . ' · ' . esc_html((string)(($m['displayId'] ?? '') ?: $inv['memberId'])))
        . $row('Centre', esc_html((string)($m['centre'] ?? '')))
        . $row('Invoice', esc_html($inv['invoiceId']))
        . $row('Paid', esc_html($paidAt))
        . $row('Method', esc_html($method) . ($ref !== '' ? ' · ref <code>' . esc_html($ref) . '</code>' : ''))
        . ($off ? $row('Paid by', esc_html((string)$off['payerName'])) : '')
        . '</table><table class="items">' . $lines . '<tr class="tot"><td>Total paid</td><td class="n">' . esc_html(fees_money_text((int)$inv['total'], $cfg)) . '</td></tr></table></div>'
        . '<div class="pr"><button onclick="window.print()">Print or save as PDF</button></div>'
        . '<div class="f">Next Generation Genius, an Afrovanguard programme' . (!empty($c['email']) ? ' · ' . esc_html((string)$c['email']) : '') . (!empty($c['phone']) ? ' · ' . esc_html((string)$c['phone']) : '')
        . '. Keep this receipt for your records. Questions about it: quote ' . esc_html($inv['receiptNo']) . '.</div></main></body></html>';
}

/** Thank the family, with the receipt. */
function membership_send_receipt(array $inv): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $to = membership_contact($m);
    if ($to === '') return ['ok' => false, 'error' => 'no_email'];
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
    $ok = @send_mail($to, 'Thank you — payment received · receipt ' . $inv['receiptNo'], email_template([
        'title' => 'Thank you. ' . $first . ' is fully enrolled.',
        'intro' => 'We have received your payment of ' . fees_money_text((int)$inv['total']) . '. Your support keeps the programme running.',
        'bodyHtml' => membership_items_html($inv, true)
            . '<p style="margin:16px 0 0;font-size:14px"><b>Receipt</b> ' . esc_html($inv['receiptNo']) . ' · <b>Invoice</b> ' . esc_html($inv['invoiceId']) . '</p>'
            . '<p style="margin:12px 0 0;font-size:14px">From next month the commitment fee is ' . esc_html(fees_money_text((int)fees_settings()['monthlyDues'])) . ' a month. We look forward to seeing ' . esc_html($first) . ' at the centre.</p>',
        'ctaLabel' => 'View and print the receipt',
        'ctaUrl' => membership_receipt_url($inv),
        'footNote' => 'With thanks from the Next Generation Genius team.',
    ]));
    return ['ok' => (bool)$ok, 'to' => mask_email($to)];
}

/* ── Paystack ────────────────────────────────────────────────────────────── */

/** What the family sees at /pay/<token>: no ledger, no other child, nothing to enumerate. */
function public_membership_invoice(array $p): array {
    $inv = membership_invoice_by('payToken', trim((string)($p['token'] ?? '')));
    if (!$inv || (string)$inv['status'] === 'void') return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT fullName, displayId, memberId, centre FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]) ?: [];
    $pending = (string)$inv['status'] === 'open' ? db_row("SELECT method, recordedAt FROM offline_payments WHERE invoiceId = ? AND status = 'pending' LIMIT 1", [(string)$inv['invoiceId']]) : null;
    $terms = membership_fee_terms();
    return ['ok' => true, 'invoice' => [
        'invoiceId' => (string)$inv['invoiceId'], 'status' => (string)$inv['status'], 'total' => (int)$inv['total'],
        'currency' => (string)$inv['currency'], 'symbol' => $terms['symbol'], 'startDate' => (string)$inv['startDate'],
        'items' => array_map(static fn($i) => ['label' => (string)$i['label'], 'detail' => (string)($i['detail'] ?? ''), 'amount' => (int)$i['amount']], membership_items($inv)),
        'firstName' => explode(' ', trim((string)($m['fullName'] ?? '')))[0] ?? '', 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
        'paidAt' => (string)$inv['paidAt'], 'receiptNo' => (string)$inv['receiptNo'],
        'receiptUrl' => (string)$inv['status'] === 'paid' ? membership_receipt_url($inv) : '',
        'pendingOffline' => $pending ? ['method' => MPAY_METHODS[(string)$pending['method']] ?? '', 'at' => (string)$pending['recordedAt']] : null,
        'paystack' => $terms['paystack'], 'bank' => $terms['bank'],
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
    $email = membership_contact($m);
    if ($email === '') return ['ok' => false, 'error' => 'no_email'];
    $ref = 'NGGM-' . strtoupper(rand_hex(8));
    $r = paystack_http('POST', '/transaction/initialize', ['email' => $email, 'amount' => (int)$inv['total'] * 100, 'currency' => (string)$inv['currency'],
        'reference' => $ref, 'callback_url' => membership_pay_url($inv),
        'metadata' => ['invoiceId' => (string)$inv['invoiceId'], 'memberId' => (string)$inv['memberId'], 'kind' => 'ngg_membership']]);
    if (empty($r['status']) || empty($r['data']['authorization_url'])) return ['ok' => false, 'error' => 'init_failed'];
    db_update('membership_invoices', ['paystackRef' => $ref], ['id' => $inv['id']]);
    audit('membership.paystack.init', null, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $ref], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'authorizationUrl' => (string)$r['data']['authorization_url'], 'reference' => $ref];
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
    if ((string)$inv['status'] === 'paid') return ['ok' => true, 'status' => 'paid', 'invoice' => $inv];
    if (empty($r['status']) || ($d['status'] ?? '') !== 'success') return ['ok' => true, 'status' => (string)($d['status'] ?? 'pending'), 'invoice' => $inv];
    if ((string)($d['reference'] ?? '') !== $reference || (int)($d['amount'] ?? 0) !== (int)$inv['total'] * 100
        || strtoupper((string)($d['currency'] ?? '')) !== strtoupper((string)$inv['currency'])) {
        audit('membership.paystack.mismatch', null, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'reference' => $reference, 'amount' => (int)($d['amount'] ?? 0), 'currency' => (string)($d['currency'] ?? '')]);
        return ['ok' => false, 'error' => 'payment_mismatch'];
    }
    $s = membership_settle((string)$inv['invoiceId'], 'paystack', $reference, 'paystack', ['channel' => (string)($d['channel'] ?? '')]);
    return ['ok' => !empty($s['ok']), 'status' => !empty($s['ok']) ? 'paid' : 'failed', 'invoice' => $s['invoice'] ?? $inv, 'error' => $s['error'] ?? null];
}

/** The /pay page's check after Paystack sends the family back. */
function public_membership_pay_verify(array $p): array {
    $inv = membership_invoice_by('payToken', trim((string)($p['token'] ?? '')));
    if (!$inv) return ['ok' => false, 'error' => 'not_found'];
    $ref = trim((string)($p['reference'] ?? ''));
    if ((string)$inv['status'] !== 'paid') {
        if ($ref === '' || $ref !== (string)$inv['paystackRef']) return ['ok' => false, 'error' => 'bad_reference'];
        $v = membership_paystack_verify($ref);
        if (empty($v['ok'])) return ['ok' => false, 'error' => $v['error'] ?? 'failed'];
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

function membership_invoice_row(array $inv, array $members, array $pending): array {
    $m = $members[(string)$inv['memberId']] ?? [];
    $op = $pending[(string)$inv['invoiceId']] ?? null;
    return [
        'invoiceId' => (string)$inv['invoiceId'], 'memberId' => (string)$inv['memberId'],
        'name' => (string)($m['fullName'] ?? ''), 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
        'total' => (int)$inv['total'], 'status' => (string)$inv['status'], 'startDate' => (string)$inv['startDate'],
        'items' => membership_items($inv), 'createdAt' => (string)$inv['createdAt'], 'sentTo' => $inv['sentTo'] ? mask_email((string)$inv['sentTo']) : '', 'sentAt' => (string)$inv['sentAt'],
        'paidVia' => (string)$inv['paidVia'], 'paidAt' => (string)$inv['paidAt'], 'receiptNo' => (string)$inv['receiptNo'],
        'receiptUrl' => (string)$inv['status'] === 'paid' ? membership_receipt_url($inv) : '', 'payUrl' => (string)$inv['status'] === 'open' ? membership_pay_url($inv) : '',
        'offline' => $op ? [
            'paymentId' => (string)$op['paymentId'], 'status' => (string)$op['status'], 'amount' => (int)$op['amount'], 'method' => (string)$op['method'],
            'methodLabel' => MPAY_METHODS[(string)$op['method']] ?? '', 'payerName' => (string)$op['payerName'], 'bankName' => (string)$op['bankName'],
            'reference' => (string)$op['reference'], 'paidOn' => (string)$op['paidOn'], 'note' => (string)$op['note'], 'evidenceType' => (string)$op['evidenceType'],
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
    $where = ''; $args = [];
    if (in_array($status, ['open', 'paid', 'void'], true)) { $where = 'WHERE status = ?'; $args[] = $status; }
    elseif ($status === 'pending') $where = "WHERE status = 'open' AND invoiceId IN (SELECT invoiceId FROM offline_payments WHERE status = 'pending')";
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
    $scope = admin_centre_names_in_scope($g['requester']);
    $out = [];
    foreach ($rows as $r) {
        $m = $members[(string)$r['memberId']] ?? [];
        if ($scope !== null && !in_array((string)($m['centre'] ?? ''), $scope, true)) continue;
        $out[] = membership_invoice_row($r, $members, $pending);
    }
    $counts = [];
    foreach (db_all('SELECT status, COUNT(*) c FROM membership_invoices GROUP BY status') as $c) $counts[(string)$c['status']] = (int)$c['c'];
    $counts['pending'] = (int)(db_row("SELECT COUNT(*) c FROM offline_payments WHERE status = 'pending'")['c'] ?? 0);
    return ['ok' => true, 'invoices' => $out, 'counts' => $counts, 'terms' => membership_fee_terms(), 'bank' => membership_pay_settings(),
            'methods' => MPAY_METHODS, 'me' => (string)$g['requester']['memberId'], 'evidenceMax' => MPAY_EVIDENCE_MAX];
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

/** admin.membership.bank.set — the transfer details printed on invoices. */
function admin_membership_bank_set(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $d = is_array($p['bank'] ?? null) ? $p['bank'] : [];
    $num = preg_replace('/\D+/', '', (string)($d['accountNumber'] ?? ''));
    if ($num !== '' && strlen($num) !== 10) return ['ok' => false, 'error' => 'bad_account_number', 'detail' => 'A Nigerian account number (NUBAN) is 10 digits.'];
    $clean = ['bankName' => mb_substr(trim((string)($d['bankName'] ?? '')), 0, 80), 'accountName' => mb_substr(trim((string)($d['accountName'] ?? '')), 0, 120), 'accountNumber' => $num];
    setting_set('membership_pay', $clean, (string)$g['requester']['memberId']);
    audit('membership.bank.set', (string)$g['requester']['memberId'], '', $clean, (string)($p['ip'] ?? ''));
    if (function_exists('cache_invalidate')) cache_invalidate('catalogue');
    return ['ok' => true, 'bank' => membership_pay_settings()];
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
    audit('membership.offline.record', $by, (string)$inv['memberId'], ['invoiceId' => $inv['invoiceId'], 'paymentId' => $row['paymentId'], 'amount' => $amount, 'method' => $method, 'reference' => $reference, 'evidence' => $ev['sha']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'paymentId' => $row['paymentId'], 'status' => 'pending'];
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
    db_update('offline_payments', ['status' => 'verified', 'verifiedBy' => $by, 'verifiedAt' => now_iso()], ['id' => $op['id']]);
    $s = membership_settle((string)$op['invoiceId'], (string)$op['method'], (string)$op['reference'], $by, ['paymentId' => $op['paymentId'], 'recordedBy' => $op['recordedBy']]);
    if (empty($s['ok'])) {
        db_update('offline_payments', ['status' => 'pending', 'verifiedBy' => '', 'verifiedAt' => ''], ['id' => $op['id']]);
        return $s;
    }
    audit('membership.offline.verify', $by, (string)$op['memberId'], ['paymentId' => $op['paymentId'], 'invoiceId' => $op['invoiceId']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'receiptNo' => (string)$s['invoice']['receiptNo'], 'receiptUrl' => membership_receipt_url($s['invoice']), 'receipt' => $s['receipt'] ?? null];
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
