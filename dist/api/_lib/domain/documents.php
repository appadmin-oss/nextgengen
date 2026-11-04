<?php
declare(strict_types=1);

/**
 * NGG's printed documents: the invoice, the receipt (and the acknowledgement
 * of a transfer still being checked) and the Math Lab certificate.
 *
 * WHAT THIS OWNS
 *
 *   Numbers.   NGG-INV-YYYY-#####, NGG-RCP-YYYY-#####, NGG-ML-LL-YYYY-#####.
 *              Minted from a counter row inside the SAME transaction that
 *              writes the record, so a rolled-back invoice rolls its number
 *              back too and the series has no gaps. Never a count, never
 *              reused: a voided invoice keeps its number, and says so.
 *   The record of issue (`documents`). One row per issued document, with a
 *              check code, a private view token and, for a receipt or a
 *              certificate, a frozen copy of what it said. A receipt is
 *              rendered from that copy for ever: renaming a centre or changing
 *              a fee later must not change a receipt somebody is holding.
 *              An invoice is rendered fresh (its status is derived: due,
 *              overdue, paid, void), with its number fixed.
 *   The pages. Server-rendered A4 pages, printed (or saved as PDF) by the
 *              browser. The host has no headless browser, so there is no PDF
 *              on the server; the frozen copy is what makes a reprint exact.
 *   Verification. /verify/<number>?c=<check code>. The number alone is
 *              sequential and therefore guessable, so it shows nothing about
 *              a child; the check code printed on the document is the key.
 *
 * Legal details (name, RC, TIN, address, contact, signatories, VAT) are a
 * setting, never typed here. An empty one is left off the page, not printed
 * as a placeholder.
 */

const DOC_SETTING = 'documents';
const DOC_DEFAULTS = [
    'legalName' => 'Next Generation Genius Initiative', 'rcNo' => '', 'tin' => '', 'address' => '',
    'feesEmail' => '', 'feesPhone' => '',
    'feesOfficer' => '', 'mathlabCoach' => '', 'programmeDirector' => '',
    'vat' => 'exempt',          // 'exempt' | 'standard' (7.5%, inside the amounts charged)
    'dueDays' => 10,
];
const DOC_VAT_RATE_BP = 750;     // 7.5%, in basis points
const DOC_DISTINCTION_PCT = 90;
const DOC_KINDS = ['invoice', 'receipt', 'ack', 'certificate'];

/* ── Settings ──────────────────────────────────────────────────────────── */

function doc_settings(): array {
    $s = setting_get(DOC_SETTING);
    $s = is_array($s) ? $s : [];
    $o = DOC_DEFAULTS;
    foreach (DOC_DEFAULTS as $k => $d) if (array_key_exists($k, $s)) $o[$k] = is_int($d) ? (int)$s[$k] : trim((string)$s[$k]);
    if ($o['legalName'] === '') $o['legalName'] = DOC_DEFAULTS['legalName'];
    if (!in_array($o['vat'], ['exempt', 'standard'], true)) $o['vat'] = 'exempt';
    $o['dueDays'] = max(1, min(60, (int)$o['dueDays']));
    $c = function_exists('org_contact') ? org_contact() : [];
    if ($o['feesEmail'] === '') $o['feesEmail'] = (string)($c['email'] ?? '');
    if ($o['feesPhone'] === '') $o['feesPhone'] = (string)($c['phone'] ?? '');
    return $o;
}

/**
 * The details a frozen document prints. What was filled in when it was issued
 * stays as it was (a receipt is not rewritten by a later change of address);
 * what was blank then takes today's value, because a blank was never printed
 * as a fact, so filling it in changes nothing anybody was told.
 */
function doc_org_freeze(): array {
    return array_intersect_key(doc_settings(), array_flip(['legalName', 'rcNo', 'tin', 'address', 'feesEmail', 'feesPhone', 'feesOfficer', 'mathlabCoach', 'programmeDirector']));
}
function doc_org_for(array $d): array {
    $now = doc_settings(); $was = is_array($d['org'] ?? null) ? $d['org'] : [];
    foreach ($was as $k => $v) if (array_key_exists($k, $now) && trim((string)$v) !== '') $now[$k] = (string)$v;
    return $now;
}

/** What is still missing for a document to be complete, in words, for the settings screen. */
function doc_settings_gaps(array $s): array {
    $g = [];
    foreach (['rcNo' => 'RC number', 'tin' => 'TIN', 'address' => 'registered address', 'feesOfficer' => 'Fees Officer’s name',
              'mathlabCoach' => 'Math Lab Coach’s name', 'programmeDirector' => 'Programme Director’s name'] as $k => $l) if ($s[$k] === '') $g[] = $l;
    return $g;
}

/** admin.documents.settings — read (fees or settings), save (settings). */
function admin_documents_settings(array $p): array {
    $save = is_array($p['data'] ?? null);
    $g = $save ? admin_cap_gate($p, 'settings') : admin_cap_gate_any($p, ['settings', 'fees']);
    if (!$g['ok']) return $g;
    if ($save) {
        $in = $p['data']; $cur = doc_settings(); $o = [];
        $max = ['legalName' => 120, 'rcNo' => 20, 'tin' => 24, 'address' => 200, 'feesEmail' => 120, 'feesPhone' => 32, 'feesOfficer' => 80, 'mathlabCoach' => 80, 'programmeDirector' => 80];
        foreach ($max as $k => $n) $o[$k] = array_key_exists($k, $in) ? mb_substr(trim((string)$in[$k]), 0, $n) : $cur[$k];
        if ($o['legalName'] === '') return ['ok' => false, 'error' => 'legal_name_required', 'message' => 'The legal name is printed on every document.'];
        if ($o['feesEmail'] !== '' && !filter_var($o['feesEmail'], FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email', 'message' => 'The fees email is not an email address.'];
        $o['vat'] = in_array((string)($in['vat'] ?? $cur['vat']), ['exempt', 'standard'], true) ? (string)($in['vat'] ?? $cur['vat']) : 'exempt';
        $o['dueDays'] = max(1, min(60, (int)($in['dueDays'] ?? $cur['dueDays'])));
        setting_set(DOC_SETTING, $o, (string)$g['requester']['memberId']);
        audit('documents.settings', $g['requester']['memberId'], 'documents', ['vat' => $o['vat'], 'dueDays' => $o['dueDays']], (string)($p['ip'] ?? ''));
    }
    $s = doc_settings();
    return ['ok' => true, 'settings' => $s, 'gaps' => doc_settings_gaps($s)];
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

/** Next serial of a series. Call INSIDE the transaction that writes the record, or a rollback leaves a gap. */
function doc_mint(string $series): int {
    if (db_exec('UPDATE doc_serials SET last = last + 1 WHERE series = ?', [$series]) === 0) {
        db_insert('doc_serials', ['series' => $series, 'last' => 1]);
        return 1;
    }
    return (int)db_row('SELECT last FROM doc_serials WHERE series = ?', [$series])['last'];
}
function doc_year(?string $iso = null): string { return doc_local($iso ?? now_iso(), 'Y'); }
function doc_invoice_no(): string { $y = doc_year(); return 'NGG-INV-' . $y . '-' . str_pad((string)doc_mint('INV-' . $y), 5, '0', STR_PAD_LEFT); }
function doc_receipt_no(): string { $y = doc_year(); return 'NGG-RCP-' . $y . '-' . str_pad((string)doc_mint('RCP-' . $y), 5, '0', STR_PAD_LEFT); }
function doc_cert_no(int $level): string { $y = doc_year(); return 'NGG-ML-' . str_pad((string)$level, 2, '0', STR_PAD_LEFT) . '-' . $y . '-' . str_pad((string)doc_mint('ML-' . $y), 5, '0', STR_PAD_LEFT); }
/** "INV-03317": the invoice's short number, for a transfer narration. */
function doc_short(string $no): string { return preg_match('/^NGG-([A-Z]+)-\d{4}-(\d+)$/', $no, $m) ? $m[1] . '-' . $m[2] : $no; }

/* ── The record of issue ───────────────────────────────────────────────── */

function doc_check_code(string $docNo): string {
    $h = strtoupper(substr(hash_hmac('sha256', 'doc|' . $docNo, (string)($GLOBALS['CONFIG']['cookie_secret'] ?? '')), 0, 12));
    return implode('-', str_split($h, 4));
}
function doc_code_ok(string $docNo, string $given): bool {
    $g = strtoupper(preg_replace('/[^0-9a-f]/i', '', $given));
    return strlen($g) === 12 && hash_equals(str_replace('-', '', doc_check_code($docNo)), $g);
}
function doc_origin(): string { return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'); }
function doc_verify_url(string $docNo): string { return doc_origin() . '/verify/' . rawurlencode($docNo) . '?c=' . str_replace('-', '', doc_check_code($docNo)); }
function doc_view_url(array $doc): string { return doc_origin() . '/api/public/document.php?t=' . rawurlencode((string)$doc['token']); }

/** Write the record of a document. Idempotent on its source: the same source returns the row already issued. */
function doc_record(string $kind, string $docNo, string $memberId, string $sourceKey, ?array $data = null): array {
    if ($have = db_row('SELECT * FROM documents WHERE sourceKey = ? LIMIT 1', [$sourceKey])) return $have;
    db_insert('documents', ['docNo' => $docNo, 'kind' => $kind, 'memberId' => $memberId, 'sourceKey' => $sourceKey, 'status' => 'issued',
        'data' => $data === null ? '' : json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'token' => rand_hex(16),
        'issuedAt' => now_iso(), 'updatedAt' => now_iso()]);
    return db_row('SELECT * FROM documents WHERE docNo = ? LIMIT 1', [$docNo]);
}
function doc_by(string $col, string $v): ?array {
    if (!in_array($col, ['docNo', 'token', 'sourceKey'], true) || $v === '') return null;
    return db_row("SELECT * FROM documents WHERE $col = ? LIMIT 1", [$v]) ?: null;
}
function doc_data(array $doc): array { $d = json_decode((string)$doc['data'], true); return is_array($d) ? $d : []; }

/* ── Invoices: minted with their number ────────────────────────────────── */

/**
 * Insert a membership invoice under the next invoice number. The number IS the
 * invoiceId, so the pay page, the emails, the narration and the printed
 * invoice all carry one number.
 */
function doc_invoice_insert(array $row): array {
    return db_tx(static function () use ($row) {
        $row['invoiceId'] = doc_invoice_no();
        db_insert('membership_invoices', $row);
        doc_record('invoice', $row['invoiceId'], (string)$row['memberId'], 'minv:' . $row['invoiceId']);
        return $row;
    });
}

/** The invoice's document row (an invoice made before numbering keeps the number it was issued under). */
function doc_for_invoice(array $inv): array {
    return doc_by('sourceKey', 'minv:' . $inv['invoiceId']) ?? doc_record('invoice', (string)$inv['invoiceId'], (string)$inv['memberId'], 'minv:' . $inv['invoiceId']);
}

/** Due, overdue, paid or void: derived each time it is read, never stored. */
function doc_invoice_state(array $inv, ?array $s = null): array {
    $s = $s ?? doc_settings();
    $issued = (string)$inv['createdAt'];
    $due = gmdate('Y-m-d', (int)strtotime(substr($issued, 0, 10) . ' 00:00:00 UTC +' . (int)$s['dueDays'] . ' days'));
    $st = (string)$inv['status'];
    $state = $st === 'paid' ? 'paid' : ($st === 'void' ? 'void' : (doc_local(now_iso(), 'Y-m-d') > $due ? 'overdue' : 'due'));
    return ['state' => $state, 'due' => $due];
}

/* ── Receipts: numbered and frozen when the invoice is settled ─────────── */

/** Card last four and method words, as the gateway reported them. */
function doc_method_text(string $via, array $extra, ?array $off): array {
    if ($via === 'paystack') {
        $l4 = preg_replace('/\D+/', '', (string)($extra['last4'] ?? ''));
        $ch = (string)($extra['channel'] ?? '');
        $t = $ch === 'bank_transfer' ? 'Transfer, Paystack' : ($ch === 'ussd' ? 'USSD, Paystack' : ($l4 !== '' ? 'Card •••• ' . $l4 . ', Paystack' : 'Card, Paystack'));
        return ['icon' => $ch === 'bank_transfer' ? 'bank' : 'card', 'text' => $t];
    }
    $bank = trim((string)($off['bankName'] ?? ''));
    $words = (defined('MPAY_METHODS') ? (MPAY_METHODS[$via] ?? '') : '') ?: ucfirst($via);
    return ['icon' => in_array($via, ['transfer', 'bank'], true) ? 'bank' : 'wallet', 'text' => $words . ($bank !== '' ? ', ' . $bank : '')];
}

/** Period words for an invoice line, from its period key ("2026-11" → "November 2026"). */
function doc_period(array $it): string {
    $k = (string)($it['periodKey'] ?? '');
    if (preg_match('/^(\d{4})-(\d{2})$/', $k)) return doc_local($k . '-15T12:00:00Z', 'F Y');
    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', (string)($it['from'] ?? ''), $a) && preg_match('/^(\d{4}-\d{2}-\d{2})/', (string)($it['to'] ?? ''), $b))
        return doc_local($a[1] . 'T12:00:00Z', 'M Y') . ' – ' . doc_local($b[1] . 'T12:00:00Z', 'M Y');
    return '';
}

/** The member, the payer and the lines, as a document prints them. */
function doc_people(array $inv): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]) ?: [];
    $app = (int)($inv['applicationId'] ?? 0) > 0 ? db_row('SELECT details, email FROM applications WHERE id = ? LIMIT 1', [(int)$inv['applicationId']]) : null;
    $det = $app ? (json_decode((string)$app['details'], true) ?: []) : [];
    $addr = implode(', ', array_filter([trim((string)($det['address'] ?? '')), trim((string)($det['lga'] ?? '')) !== '' ? trim((string)$det['lga']) . ' LGA' : '',
        trim((string)($det['state'] ?? '')) !== '' ? trim((string)$det['state']) . ' State' : '']));
    $payer = trim((string)($m['parentName'] ?? '')) ?: trim((string)($det['parent1Name'] ?? ''));
    return [
        'member' => ['name' => (string)($m['fullName'] ?? ''), 'id' => (string)(($m['displayId'] ?? '') ?: ($m['memberId'] ?? '')),
                     'centre' => (string)($m['centre'] ?? ''), 'track' => (string)($m['track'] ?? ''), 'level' => (string)($m['level'] ?? '')],
        'payer' => ['name' => $payer !== '' ? $payer : (string)($m['fullName'] ?? ''), 'rel' => $payer !== '' ? 'Parent / guardian' : 'Member',
                    'email' => function_exists('membership_contact') ? membership_contact($m) : '', 'address' => $addr],
    ];
}
function doc_lines(array $inv): array {
    $out = [];
    foreach (function_exists('membership_items') ? membership_items($inv) : [] as $it) {
        $qty = max(1, (int)($it['qty'] ?? 1)); $amt = (int)$it['amount'];
        $out[] = ['label' => (string)$it['label'], 'detail' => (string)($it['detail'] ?? ''), 'period' => doc_period($it), 'qty' => $qty,
                  'unit' => intdiv($amt * 100, $qty), 'kobo' => $amt * 100];
    }
    if ((int)($inv['processingFee'] ?? 0) > 0) $out[] = ['label' => 'Paystack charge', 'detail' => 'paid to Paystack for the online payment, not an NGG fee',
        'period' => '', 'qty' => 1, 'unit' => (int)$inv['processingFee'] * 100, 'kobo' => (int)$inv['processingFee'] * 100, 'gateway' => true];
    return $out;
}

/**
 * Number and freeze the receipt for a settled invoice. Runs inside the settle
 * transaction (membership_settle), so the receipt number and the payment are
 * one act: neither exists without the other.
 */
function doc_receipt_issue(array $inv, string $via, string $reference, array $extra = []): array {
    $no = doc_receipt_no();
    $off = $via !== 'paystack' ? db_row("SELECT * FROM offline_payments WHERE invoiceId = ? ORDER BY id DESC LIMIT 1", [(string)$inv['invoiceId']]) : null;
    $who = doc_people($inv);
    if ($off && trim((string)$off['payerName']) !== '') $who['payer'] = ['name' => (string)$off['payerName'], 'rel' => $who['payer']['rel']] + $who['payer'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$inv['memberId']]);
    $bal = $m && function_exists('fees_balance') ? (int)(fees_balance($m)['outstanding'] ?? 0) : null;
    $data = ['no' => $no, 'invoiceNo' => (string)$inv['invoiceId'], 'invoiceIssued' => (string)$inv['createdAt'], 'paidAt' => now_iso(),
             'member' => $who['member'], 'payer' => array_diff_key($who['payer'], ['address' => 1, 'email' => 1]),
             'method' => doc_method_text($via, $extra, $off), 'ref' => $reference !== '' ? $reference : (string)($off['reference'] ?? ''),
             'lines' => doc_lines($inv), 'vat' => doc_settings()['vat'], 'balanceAfter' => $bal, 'org' => doc_org_freeze()];
    doc_record('receipt', $no, (string)$inv['memberId'], 'rcp:' . $inv['invoiceId'], $data);
    return ['no' => $no, 'data' => $data];
}

/** The receipt row for a paid invoice. One paid before receipts were frozen is rendered from the invoice, under its old number. */
function doc_for_receipt(array $inv): ?array {
    if ((string)$inv['status'] !== 'paid') return null;
    $d = doc_by('sourceKey', 'rcp:' . $inv['invoiceId']);
    if ($d) return $d;
    $who = doc_people($inv);
    $off = (string)$inv['paidVia'] !== 'paystack' ? db_row("SELECT * FROM offline_payments WHERE invoiceId = ? AND status = 'verified' ORDER BY id DESC LIMIT 1", [(string)$inv['invoiceId']]) : null;
    $data = ['no' => (string)$inv['receiptNo'], 'invoiceNo' => (string)$inv['invoiceId'], 'invoiceIssued' => (string)$inv['createdAt'], 'paidAt' => (string)$inv['paidAt'],
             'member' => $who['member'], 'payer' => array_diff_key($who['payer'], ['address' => 1, 'email' => 1]),
             'method' => doc_method_text((string)$inv['paidVia'], [], $off), 'ref' => (string)$inv['paystackRef'] ?: (string)($off['reference'] ?? ''),
             'lines' => doc_lines($inv), 'vat' => 'exempt', 'balanceAfter' => null, 'legacy' => true];
    return doc_record('receipt', (string)$inv['receiptNo'], (string)$inv['memberId'], 'rcp:' . $inv['invoiceId'], $data);
}

/** A transfer the desk has recorded and a second person has yet to check: the family is given an acknowledgement, never a receipt. */
function doc_ack_issue(array $off): array {
    return doc_record('ack', (string)$off['paymentId'], (string)$off['memberId'], 'ack:' . $off['paymentId']);
}
/** The transfer was checked: confirmed (the receipt supersedes the acknowledgement) or refused. */
function doc_ack_close(string $paymentId, string $status, string $receiptNo = ''): void {
    db_update('documents', ['status' => $status === 'verified' ? 'superseded' : 'void', 'supersededBy' => $receiptNo, 'updatedAt' => now_iso()], ['sourceKey' => 'ack:' . $paymentId]);
}

/* ── Math Lab certificates ─────────────────────────────────────────────── */

/**
 * Called when a member clears a level. Once per level on the first clear; a
 * later clear at 90% or more on a Pass certificate issues a Distinction one
 * that supersedes it (the old one verifies as "superseded"). Members only:
 * a certificate names its holder.
 */
function doc_ml_issue(string $memberId, int $level, int $pct, int $correct, int $total, int $stage): ?array {
    $m = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    $lv = function_exists('mathlab_levels') ? (mathlab_levels()[$level] ?? null) : null;
    if (!$m || !$lv || $pct < MATHLAB_PASS_PCT) return null;
    $dist = $pct >= DOC_DISTINCTION_PCT;
    $cur = db_row("SELECT * FROM documents WHERE kind = 'certificate' AND memberId = ? AND sourceKey LIKE ? AND status = 'issued' ORDER BY id DESC LIMIT 1", [$memberId, 'ml:' . $memberId . ':' . $level . ':%']);
    if ($cur && (!$dist || !empty(doc_data($cur)['distinction']))) return null;
    return db_tx(static function () use ($m, $lv, $level, $pct, $correct, $total, $stage, $dist, $cur, $memberId) {
        $no = doc_cert_no($level);
        $stages = function_exists('mathlab_stages') ? mathlab_stages() : [];
        $doc = doc_record('certificate', $no, $memberId, 'ml:' . $memberId . ':' . $level . ':' . ($dist ? 'distinction' : 'pass'), [
            'no' => $no, 'name' => (string)$m['fullName'], 'level' => $level, 'levelName' => (string)$lv['name'], 'band' => (string)$lv['band'],
            'strand' => (string)$lv['strand'], 'blurb' => (string)$lv['blurb'], 'pct' => $pct, 'correct' => $correct, 'total' => $total,
            'paper' => (string)($stages[$stage]['name'] ?? 'Foundation'), 'distinction' => $dist, 'awarded' => now_iso(), 'org' => doc_org_freeze()]);
        if ($cur) db_update('documents', ['status' => 'superseded', 'supersededBy' => $no, 'updatedAt' => now_iso()], ['id' => (int)$cur['id']]);
        return $doc;
    });
}

/* ── Who may see which ─────────────────────────────────────────────────── */

/** A member's documents, newest first, with private links: for the Family Portal and the member. */
function documents_for_member(string $memberId): array {
    $out = [];
    foreach (db_all("SELECT * FROM membership_invoices WHERE memberId = ? AND status IN ('open','paid','void') ORDER BY id DESC LIMIT 30", [$memberId]) as $inv) {
        $d = doc_for_invoice($inv); $st = doc_invoice_state($inv);
        $out[] = ['kind' => 'invoice', 'no' => (string)$d['docNo'], 'title' => 'Invoice', 'state' => $st['state'], 'at' => (string)$inv['createdAt'],
                  'amount' => (int)$inv['total'], 'url' => doc_view_url($d)];
        if ($r = doc_for_receipt($inv)) $out[] = ['kind' => 'receipt', 'no' => (string)$r['docNo'], 'title' => 'Receipt', 'state' => 'paid', 'at' => (string)$inv['paidAt'],
                  'amount' => (int)$inv['total'] + (int)($inv['processingFee'] ?? 0), 'url' => doc_view_url($r)];
    }
    foreach (db_all("SELECT * FROM documents WHERE kind = 'ack' AND memberId = ? AND status = 'issued' ORDER BY id DESC LIMIT 10", [$memberId]) as $a) {
        $off = db_row('SELECT amount, recordedAt FROM offline_payments WHERE paymentId = ? LIMIT 1', [(string)$a['docNo']]);
        if ($off) $out[] = ['kind' => 'ack', 'no' => (string)$a['docNo'], 'title' => 'Acknowledgement', 'state' => 'pending', 'at' => (string)$off['recordedAt'], 'amount' => (int)$off['amount'], 'url' => doc_view_url($a)];
    }
    foreach (db_all("SELECT * FROM documents WHERE kind = 'certificate' AND memberId = ? ORDER BY id DESC LIMIT 40", [$memberId]) as $c) {
        $x = doc_data($c);
        $out[] = ['kind' => 'certificate', 'no' => (string)$c['docNo'], 'title' => 'Math Lab · Level ' . (int)($x['level'] ?? 0) . ': ' . (string)($x['levelName'] ?? ''),
                  'state' => (string)$c['status'], 'at' => (string)$c['issuedAt'], 'amount' => null, 'url' => doc_view_url($c)];
    }
    usort($out, static fn($a, $b) => strcmp($b['at'], $a['at']));
    return $out;
}

/** What the verify page may say: what the document is, and whether it stands. Never money to a stranger who lacks the code. */
function public_document_verify(array $p): array {
    $no = strtoupper(trim((string)($p['no'] ?? '')));
    if (!preg_match('/^NGG-[A-Z0-9-]{6,32}$/', $no)) return ['ok' => false, 'error' => 'bad_number'];
    $doc = doc_by('docNo', $no);
    if (!$doc || !doc_code_ok($no, (string)($p['code'] ?? ''))) return ['ok' => false, 'error' => 'not_matched'];
    $d = doc_data($doc); $first = static fn($n) => trim(explode(' ', trim((string)$n))[0] . ' ' . mb_substr((string)(explode(' ', trim((string)$n))[1] ?? ''), 0, 1) . (str_contains(trim((string)$n), ' ') ? '.' : ''));
    $out = ['ok' => true, 'no' => $no, 'kind' => (string)$doc['kind'], 'issuedAt' => (string)$doc['issuedAt'], 'status' => (string)$doc['status'], 'supersededBy' => (string)($doc['supersededBy'] ?? '')];
    if ($doc['kind'] === 'certificate') $out += ['holder' => $first($d['name'] ?? ''), 'what' => 'Level ' . (int)$d['level'] . ': ' . $d['levelName'], 'result' => !empty($d['distinction']) ? 'Distinction' : 'Pass'];
    if ($doc['kind'] === 'receipt') $out += ['holder' => $first($d['member']['name'] ?? ''), 'what' => 'Payment for invoice ' . ($d['invoiceNo'] ?? ''),
        'amount' => array_sum(array_column($d['lines'] ?? [], 'kobo')), 'at' => (string)($d['paidAt'] ?? '')];
    if ($doc['kind'] === 'invoice') {
        $inv = db_row('SELECT * FROM membership_invoices WHERE invoiceId = ? LIMIT 1', [$no]);
        if ($inv) { $who = doc_people($inv); $out += ['holder' => $first($who['member']['name']), 'what' => 'Invoice', 'amount' => (int)$inv['total'] * 100, 'state' => doc_invoice_state($inv)['state']]; }
    }
    return $out;
}

/* ── Formatting ────────────────────────────────────────────────────────── */

function doc_local(string $iso, string $fmt): string {
    $t = strtotime($iso); if ($t === false) return '';
    return (new DateTimeImmutable('@' . $t))->setTimezone(new DateTimeZone('Africa/Lagos'))->format($fmt);
}
function doc_naira(int $kobo): string { return '₦' . number_format($kobo / 100, 2); }
/** The hero figure: whole naira, then the kobo muted. */
function doc_hero(int $kobo): string { return '₦' . number_format(intdiv($kobo, 100)) . '<span class="k">.' . str_pad((string)($kobo % 100), 2, '0', STR_PAD_LEFT) . '</span>'; }
/** "Four thousand naira only." */
function doc_words(int $naira): string {
    $a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    $t = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    $h = static function (int $x) use ($a, $t): string {
        $s = '';
        if ($x >= 100) { $s .= $a[intdiv($x, 100)] . ' hundred'; $x %= 100; if ($x) $s .= ' and '; }
        if ($x >= 20) { $s .= $t[intdiv($x, 10)]; if ($x % 10) $s .= '-' . $a[$x % 10]; } elseif ($x) $s .= $a[$x];
        return $s;
    };
    $p = []; $b = intdiv($naira, 1000000000); $mi = intdiv($naira % 1000000000, 1000000); $k = intdiv($naira % 1000000, 1000); $r = $naira % 1000;
    if ($b) $p[] = $h($b) . ' billion'; if ($mi) $p[] = $h($mi) . ' million'; if ($k) $p[] = $h($k) . ' thousand';
    if ($r) $p[] = ($r < 100 && $p ? 'and ' : '') . $h($r);
    $w = implode(' ', $p) ?: 'zero';
    return mb_strtoupper(mb_substr($w, 0, 1)) . mb_substr($w, 1) . ' naira only.';
}
/** VAT inside an amount charged: what is VAT, in kobo, at 7.5%. The total never moves: it is what the ledger charged. */
function doc_vat_inside(int $kobo, string $mode): int {
    return $mode === 'standard' ? $kobo - (int)round($kobo * 10000 / (10000 + DOC_VAT_RATE_BP)) : 0;
}
function doc_e(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/** A QR as inline SVG: crisp at any print size, no request. */
function doc_qr_svg(string $text, string $label): string {
    [$n, $mx] = function_exists('qr_matrix') ? qr_matrix($text) : [0, []];
    if (!$n) return '';
    $q = 2; $d = '';
    foreach ($mx as $y => $row) foreach ($row as $x => $on) if ($on) $d .= 'M' . ($x + $q) . ' ' . ($y + $q) . 'h1v1h-1z';
    $s = $n + 2 * $q;
    return '<svg class="qr" viewBox="0 0 ' . $s . ' ' . $s . '" role="img" aria-label="' . doc_e($label) . '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' . $d . '" fill="#0e1630"/></svg>';
}

/** The seven icons the documents use, drawn here (no icon font to fetch). */
function doc_icon(string $k): string {
    $p = [
        'check' => '<circle cx="128" cy="128" r="96"/><polyline points="88 136 112 160 168 104"/>',
        'hourglass' => '<path d="M72 40h112M72 216h112M80 40c0 56 96 64 96 88s-96 32-96 88M176 40c0 56-96 64-96 88s96 32 96 88"/>',
        'clock' => '<circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/>',
        'warning' => '<circle cx="128" cy="128" r="96"/><line x1="128" y1="80" x2="128" y2="136"/><circle cx="128" cy="172" r="4"/>',
        'card' => '<rect x="24" y="56" width="208" height="144" rx="8"/><line x1="24" y1="96" x2="232" y2="96"/><line x1="168" y1="168" x2="200" y2="168"/>',
        'bank' => '<polygon points="24 96 128 40 232 96"/><line x1="48" y1="96" x2="48" y2="184"/><line x1="96" y1="96" x2="96" y2="184"/><line x1="160" y1="96" x2="160" y2="184"/><line x1="208" y1="96" x2="208" y2="184"/><line x1="24" y1="216" x2="232" y2="216"/><line x1="32" y1="184" x2="224" y2="184"/>',
        'wallet' => '<path d="M40 64v128a16 16 0 0 0 16 16h160a8 8 0 0 0 8-8V88a8 8 0 0 0-8-8H56a16 16 0 0 1-16-16Zm0 0a16 16 0 0 1 16-16h136"/><circle cx="180" cy="144" r="10"/>',
    ][$k] ?? '';
    return '<svg class="ic" viewBox="0 0 256 256" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">' . $p . '</svg>';
}

/* ── The pages ─────────────────────────────────────────────────────────── */

/** The page every document sits on: the screen desk, the print rules, the fonts. */
function doc_page(string $title, string $body, bool $landscape = false): string {
    $w = $landscape ? 1123 : 794; $h = $landscape ? 794 : 1123;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . doc_e($title) . '</title><link rel="stylesheet" href="/assets/fonts/fonts.css"><style>'
        . '@page{size:A4 ' . ($landscape ? 'landscape' : 'portrait') . ';margin:0}'
        . 'body{margin:0;background:#e9ebf1;font-family:"Geist",system-ui,sans-serif;color:#0e1630;-webkit-font-smoothing:antialiased}'
        . 'a{color:#1f3263;text-decoration:underline;text-underline-offset:2px}a:hover{color:#0e1630}'
        . '.desk{min-height:100vh;display:flex;flex-direction:column;align-items:safe center;padding:48px 20px;box-sizing:border-box;gap:16px}'
        . '.tools{width:' . $w . 'px;max-width:100%;display:flex;gap:10px;justify-content:flex-end;align-items:center}.tools button{font:600 14px/1 "Geist",sans-serif;padding:11px 18px;border-radius:999px;border:0;background:#1f3263;color:#fff;cursor:pointer;min-height:44px}'
        . '.tools .over{margin-right:auto;color:#8a1c10;font-size:13.5px}'
        . '.sheet{width:' . $w . 'px;' . ($landscape ? 'height' : 'min-height') . ':' . $h . 'px;flex:none;background:#fff;box-shadow:0 30px 80px -40px rgba(14,22,48,.35);display:flex;flex-direction:column;box-sizing:border-box;position:relative;overflow:hidden}'
        . '.mono{font-family:"Geist Mono",monospace}.ic{width:1.1em;height:1.1em;flex:none}.qr{display:block}'
        . '.strip{height:6px;display:grid;grid-template-columns:1fr 120px;flex:none}.strip span:first-child{background:#1f3263}.strip span:last-child{background:#fbb21f}'
        . '.in{padding:34px 52px 26px;display:flex;flex-direction:column;flex:1}'
        . '.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}.org{display:flex;align-items:center;gap:12px}.org img{width:46px;height:46px}'
        . '.org b{display:block;font-weight:600;font-size:15px;letter-spacing:-.01em}.org small{display:block;font-size:12px;color:#6a7190;margin-top:2px}'
        . '.ttl{display:flex;flex-direction:column;align-items:flex-end;gap:4px}.ttl b{font:800 28px/1 "Bricolage Grotesque",sans-serif;letter-spacing:-.03em}.ttl span{font-size:12.5px;color:#4a5272}'
        . '.hero{margin-top:24px;background:#1f3263;color:#fff;border-radius:16px;padding:20px 28px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end}'
        . '.hero .l{display:flex;flex-direction:column;gap:10px}.hero .lab{font-size:13px;color:#c9d1e6}.hero .amt{font:800 50px/.9 "Bricolage Grotesque",sans-serif;letter-spacing:-.045em;font-variant-numeric:tabular-nums}'
        . '.hero .amt .k{color:#8d9ac0}.hero .sub{font-size:14px;color:#dfe4f1}'
        . '.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap}'
        . '.p-gold{background:#fbb21f;color:#0e1630}.p-wait{background:#ffe3a3;color:#0e1630}.p-ok{background:#c8f0d6;color:#0f5a2f}.p-bad{background:#ffd6d0;color:#8a1c10}.p-void{background:#eceef2;color:#4a5272}'
        . '.facts{margin-top:22px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px 28px}.parties{margin-top:22px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr);gap:28px}'
        . '.f{display:flex;flex-direction:column;gap:5px;min-width:0}.f .k{font-size:12px;color:#6a7190}.f .v{font-size:14.5px;font-weight:600}.f .v.m{font-weight:500}.f .s{font-size:13px;line-height:1.5;color:#4a5272}.f .row{display:flex;align-items:center;gap:6px}.f .row .ic{color:#1f3263}'
        . '.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px 16px;font-size:13px;align-content:start}.kv span:nth-child(odd){color:#6a7190}.kv span:nth-child(even){text-align:right;font-weight:500}.kv .late{color:#b42318;font-weight:600}'
        . '.lines{margin-top:22px}.lh,.ln{display:grid;gap:16px}.lh{padding:0 0 10px;border-bottom:1px solid #0e1630;font-size:12px;color:#6a7190}'
        . '.ln{align-items:baseline;padding:10px 0;border-bottom:1px solid #eceef2;font-size:14.5px;font-variant-numeric:tabular-nums}.ln .d{color:#6a7190}.ln .p{color:#4a5272}.r{text-align:right}'
        . '.rc .lh,.rc .ln{grid-template-columns:minmax(0,1fr) 150px 120px}.iv .lh,.iv .ln{grid-template-columns:minmax(0,1fr) 40px 100px 64px 110px;gap:14px}.iv .ln{font-size:14px}.iv .ln .two{display:flex;flex-direction:column;gap:3px}.iv .ln .two .d{font-size:12.5px}'
        . '.sum{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:40px;padding-top:14px}.words{font-size:13px;line-height:1.55;color:#4a5272}.words span{color:#6a7190}'
        . '.tot{display:flex;flex-direction:column;gap:9px;font-size:14px;font-variant-numeric:tabular-nums}.tot div{display:flex;justify-content:space-between;color:#4a5272}.tot .grand{align-items:baseline;padding-top:12px;border-top:2px solid #fbb21f;font-weight:600;color:#0e1630}.tot .grand span:last-child{font-size:18px}'
        . '.box{margin-top:20px;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:10px;font-size:13.5px;line-height:1.45}.box .ic{font-size:18px}.b-info{background:#f2f4f9;color:#1f3263}.b-warn{background:#fdf6e3;color:#6b4700}.box strong{font-weight:600}'
        . '.pay{margin-top:22px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.card{border:1px solid #e4e6ec;border-radius:12px;padding:12px 16px;display:flex;gap:14px;align-items:center;font-size:13px}.card.col{flex-direction:column;align-items:stretch;gap:6px}'
        . '.card .h{display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:#0e1630}.card .h .ic{color:#1f3263}.card .t{display:flex;flex-direction:column;gap:4px;font-size:12.5px;line-height:1.5;color:#4a5272;min-width:0}.card .t a{font-size:12px;overflow-wrap:anywhere}'
        . '.card .kv{gap:4px 14px}.card .kv span:nth-child(even){font-weight:400}'
        . '.foot{margin-top:auto;padding-top:24px;display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:40px;align-items:end}.ver{display:flex;gap:16px;align-items:center}.ver .qr{width:76px;height:76px;border:1px solid #e4e6ec;border-radius:8px;padding:4px;box-sizing:border-box}'
        . '.ver .t,.terms{display:flex;flex-direction:column;gap:4px;font-size:12.5px;line-height:1.5;color:#4a5272}.ver b,.terms b{font-size:13.5px;font-weight:600;color:#0e1630}.code{font-size:11.5px;color:#6a7190}'
        . '.sign{display:flex;flex-direction:column;gap:4px}.sign .line{height:28px;border-bottom:1px solid #0e1630}.sign b{font-size:13px;font-weight:600}.sign span{font-size:12px;color:#6a7190}'
        . '.legal{margin-top:18px;padding-top:12px;border-top:1px solid #e4e6ec;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;font-size:11px;line-height:1.6;color:#6a7190}.legal .mono{white-space:nowrap}'
        . '@media print{body{background:#fff}.desk{padding:0;display:block}.tools{display:none}.sheet{box-shadow:none}}'
        . '</style></head><body><div class="desk"><div class="tools"><span class="over" id="docOver" hidden>This document runs past one page. Tell the Fees desk.</span><button type="button" id="docPrint">Print or save as PDF</button></div>'
        . $body . '</div><script>'
        . '(function(){var s=document.querySelector(".sheet"),b=document.getElementById("docPrint");b.addEventListener("click",function(){window.print();});'
        . 'function chk(){var o=s.scrollHeight>' . $h . '+1;document.getElementById("docOver").hidden=!o;b.disabled=o;}'
        . 'if(document.fonts&&document.fonts.ready)document.fonts.ready.then(chk);else chk();})();</script></body></html>';
}

function doc_org_head(array $s, string $title, string $no): string {
    $ids = implode(' · ', array_filter([$s['rcNo'] !== '' ? 'RC ' . $s['rcNo'] : '', $s['tin'] !== '' ? 'TIN ' . $s['tin'] : '']));
    return '<header class="hd"><div class="org"><img src="/assets/logo.png" alt="Next Generation Genius"><div><b>' . doc_e($s['legalName']) . '</b>' . ($ids !== '' ? '<small>' . doc_e($ids) . '</small>' : '') . '</div></div>'
        . '<div class="ttl"><b>' . doc_e($title) . '</b><span class="mono">' . doc_e($no) . '</span></div></header>';
}
function doc_legal(array $s, string $tail): string {
    $who = implode(' · ', array_filter([$s['legalName'], $s['address'], implode(' · ', array_filter([$s['feesEmail'], $s['feesPhone']]))]));
    return '<footer class="legal"><span>' . doc_e($who) . '. ' . doc_e($tail) . '</span><span class="mono">Page 1 of 1</span></footer>';
}
function doc_sign(array $s, string $name, string $role): string {
    return '<div class="sign"><span class="line"></span><b>' . doc_e($name) . '</b><span>' . doc_e($role) . '</span></div>';
}
function doc_code_line(array $doc): string {
    return trim((string)($doc['irn'] ?? '')) !== '' ? 'NRS IRN ' . (string)$doc['irn'] : 'Check code ' . doc_check_code((string)$doc['docNo']);
}

/** The receipt, from its frozen copy. */
function doc_render_receipt(array $doc): string {
    $d = doc_data($doc); $s = doc_org_for($d);
    $kobo = array_sum(array_column($d['lines'] ?? [], 'kobo'));
    $vat = doc_vat_inside($kobo, (string)($d['vat'] ?? 'exempt'));
    $lines = '';
    foreach ($d['lines'] ?? [] as $l) $lines .= '<div class="ln"><span><span>' . doc_e($l['label']) . '</span>' . ($l['detail'] !== '' ? ' <span class="d">· ' . doc_e($l['detail']) . '</span>' : '') . '</span>'
        . '<span class="p">' . doc_e((string)$l['period']) . '</span><span class="r">' . doc_naira((int)$l['kobo']) . '</span></div>';
    $paid = (string)($d['paidAt'] ?? '');
    $bal = $d['balanceAfter'];
    $m = $d['member'] ?? []; $py = $d['payer'] ?? [];
    $body = '<article class="sheet rc" data-doc="receipt"><div class="strip"><span></span><span></span></div><div class="in">'
        . doc_org_head($s, 'Receipt', (string)$doc['docNo'])
        . '<section class="hero"><div class="l"><span class="lab">Total paid</span><span class="amt">' . doc_hero($kobo) . '</span><span class="sub">Received with thanks on ' . doc_e(doc_local($paid, 'j F Y')) . '.</span></div>'
        . '<span class="pill p-gold">' . doc_icon('check') . 'Paid in full</span></section>'
        . '<section class="facts">'
        . '<div class="f"><span class="k">Received from</span><span class="v">' . doc_e((string)($py['name'] ?? '')) . '</span><span class="s">' . doc_e((string)($py['rel'] ?? '')) . '</span></div>'
        . '<div class="f"><span class="k">For member</span><span class="v">' . doc_e((string)($m['name'] ?? '')) . '</span><span class="s"><span class="mono">' . doc_e((string)($m['id'] ?? '')) . '</span>' . (($m['centre'] ?? '') !== '' ? ' · ' . doc_e($m['centre']) . ' centre' : '') . '</span></div>'
        . '<div class="f"><span class="k">Settles invoice</span><span class="v m mono">' . doc_e((string)($d['invoiceNo'] ?? '')) . '</span><span class="s">Issued ' . doc_e(doc_local((string)($d['invoiceIssued'] ?? ''), 'j M Y')) . '</span></div>'
        . '<div class="f"><span class="k">Paid on</span><span class="v m">' . doc_e(doc_local($paid, 'j M Y, H:i')) . ' WAT</span></div>'
        . '<div class="f"><span class="k">Method</span><span class="v m row">' . doc_icon((string)($d['method']['icon'] ?? 'card')) . doc_e((string)($d['method']['text'] ?? '')) . '</span></div>'
        . '<div class="f"><span class="k">Transaction ref.</span><span class="v m mono">' . doc_e((string)($d['ref'] ?? '') ?: '—') . '</span></div>'
        . '</section>'
        . '<section class="lines"><div class="lh"><span>Description</span><span>Period</span><span class="r">Amount</span></div>' . $lines
        . '<div class="sum"><span class="words"><span>Amount in words:</span> ' . doc_e(doc_words(intdiv($kobo, 100))) . '</span><div class="tot">'
        . '<div><span>Subtotal</span><span>' . doc_naira($kobo - $vat) . '</span></div><div><span>VAT</span><span>' . ($vat ? doc_naira($vat) . ' (7.5%)' : 'Exempt') . '</span></div>'
        . '<div class="grand"><span>Total paid</span><span>' . doc_naira($kobo) . '</span></div></div></div></section>'
        . ($bal !== null ? '<section class="box b-info">' . doc_icon('wallet') . '<span><strong>Balance after this payment: ' . doc_naira(max(0, (int)$bal) * 100) . '.</strong>' . ((int)$bal > 0 ? ' The rest is on the Family Portal statement.' : '') . '</span></section>' : '')
        . '<section class="foot"><div class="ver">' . doc_qr_svg(doc_verify_url((string)$doc['docNo']), 'Verification code') . '<div class="t"><b>Verify this receipt</b><span>Scan it, or open ' . doc_e(preg_replace('#^https?://#', '', doc_origin())) . '/verify and enter the number and check code.</span><span class="mono code">' . doc_e(doc_code_line($doc)) . '</span></div></div>'
        . doc_sign($s, $s['feesOfficer'], 'Fees Officer, for ' . $s['legalName']) . '</section>'
        . doc_legal($s, 'Computer-generated receipt, valid without signature or stamp. Fees are governed by the NGG fees policy accepted at enrolment. Keep for your records.')
        . '</div></article>';
    return doc_page('Receipt ' . $doc['docNo'], $body);
}

/** An acknowledgement: a transfer the family reported, still being checked. Not a receipt and carries no receipt number. */
function doc_render_ack(array $off, array $inv, array $doc): string {
    $s = doc_settings(); $who = doc_people($inv); $kobo = (int)$off['amount'] * 100;
    $method = doc_method_text((string)$off['method'] ?: 'transfer', [], $off);
    $body = '<article class="sheet rc" data-doc="acknowledgement"><div class="strip"><span></span><span></span></div><div class="in">'
        . doc_org_head($s, 'Acknowledgement', (string)$off['paymentId'])
        . '<section class="hero"><div class="l"><span class="lab">Total sent</span><span class="amt">' . doc_hero($kobo) . '</span><span class="sub">Received by bank transfer. It counts once the Fees desk confirms it.</span></div>'
        . ((string)$off['status'] === 'verified' ? '<span class="pill p-gold">' . doc_icon('check') . 'Confirmed</span></section>'
           : ((string)$off['status'] === 'rejected' ? '<span class="pill p-bad">' . doc_icon('warning') . 'Not confirmed</span></section>'
           : '<span class="pill p-wait">' . doc_icon('hourglass') . 'Pending confirmation</span></section>'))
        . '<section class="facts">'
        . '<div class="f"><span class="k">Sent by</span><span class="v">' . doc_e((string)$off['payerName'] ?: $who['payer']['name']) . '</span><span class="s">' . doc_e($who['payer']['rel']) . '</span></div>'
        . '<div class="f"><span class="k">For member</span><span class="v">' . doc_e($who['member']['name']) . '</span><span class="s"><span class="mono">' . doc_e($who['member']['id']) . '</span>' . ($who['member']['centre'] !== '' ? ' · ' . doc_e($who['member']['centre']) . ' centre' : '') . '</span></div>'
        . '<div class="f"><span class="k">Towards invoice</span><span class="v m mono">' . doc_e((string)$inv['invoiceId']) . '</span><span class="s">Issued ' . doc_e(doc_local((string)$inv['createdAt'], 'j M Y')) . '</span></div>'
        . '<div class="f"><span class="k">Sent</span><span class="v m">' . doc_e(doc_local((string)($off['recordedAt'] ?: now_iso()), 'j M Y, H:i')) . ' WAT</span></div>'
        . '<div class="f"><span class="k">Method</span><span class="v m row">' . doc_icon($method['icon']) . doc_e($method['text']) . '</span></div>'
        . '<div class="f"><span class="k">Transaction ref.</span><span class="v m mono">' . doc_e((string)$off['reference'] ?: '—') . '</span></div></section>'
        . ((string)$off['status'] === 'verified' ? '<section class="box b-info">' . doc_icon('check') . '<span><strong>Confirmed and applied.</strong> The receipt is ' . doc_e((string)$doc['supersededBy']) . '.</span></section>'
           : ((string)$off['status'] === 'rejected' ? '<section class="box b-warn">' . doc_icon('warning') . '<span><strong>The Fees desk could not match this transfer.</strong> ' . doc_e((string)$off['rejectReason']) . '</span></section>'
           : '<section class="box b-warn">' . doc_icon('hourglass') . '<span><strong>Not yet applied to the account.</strong> Transfers are checked within 2 working days, then a receipt is sent.</span></section>'))
        . '<section class="foot"><div class="ver"><div class="t"><b>This is not a receipt</b><span>The receipt follows when the Fees desk confirms the transfer.</span></div></div>' . doc_sign($s, $s['feesOfficer'], 'Fees Officer, for ' . $s['legalName']) . '</section>'
        . doc_legal($s, 'Computer-generated acknowledgement of a payment reported to NGG. It is not a receipt.')
        . '</div></article>';
    return doc_page('Acknowledgement ' . $off['paymentId'], $body);
}

/** The invoice, fresh: its status is derived each time it is read. */
function doc_render_invoice(array $inv, array $doc): string {
    $s = doc_settings(); $who = doc_people($inv); $st = doc_invoice_state($inv, $s);
    $lines = doc_lines($inv); $kobo = array_sum(array_column($lines, 'kobo'));
    $vat = doc_vat_inside($kobo, $s['vat']); $paid = $st['state'] === 'paid' ? $kobo : 0; $due = $kobo - $paid;
    $rcp = $st['state'] === 'paid' ? doc_for_receipt($inv) : null;
    [$pillC, $pillI, $pillT] = ['due' => ['p-gold', 'clock', 'Payment due'], 'overdue' => ['p-bad', 'warning', 'Overdue'], 'paid' => ['p-ok', 'check', 'Paid in full'], 'void' => ['p-void', 'warning', 'Cancelled']][$st['state']];
    $dueText = doc_local($st['due'] . 'T12:00:00Z', 'j F Y');
    $sub = ['due' => 'Due by ' . $dueText, 'overdue' => 'Was due ' . $dueText . '. Please pay now to keep sessions active.',
            'paid' => 'Settled ' . doc_local((string)$inv['paidAt'], 'j F Y') . ($rcp ? ' · Receipt ' . $rcp['docNo'] : ''),
            'void' => 'This invoice was cancelled and is not to be paid.' . (trim((string)$inv['voidReason']) !== '' ? ' ' . ucfirst(preg_replace('/^superseded: /', '', (string)$inv['voidReason'])) . '.' : '')][$st['state']];
    $rows = '';
    foreach ($lines as $l) $rows .= '<div class="ln"><div class="two"><span>' . doc_e($l['label']) . '</span><span class="d">' . doc_e(trim($l['detail'] . ($l['period'] !== '' && !str_contains($l['label'], $l['period']) ? ' · ' . $l['period'] : ''), ' ·')) . '</span></div>'
        . '<span class="r p">' . (int)$l['qty'] . '</span><span class="r p">' . doc_naira((int)$l['unit']) . '</span><span class="r p">' . (!empty($l['gateway']) || $s['vat'] === 'exempt' ? 'Exempt' : '7.5%') . '</span><span class="r">' . doc_naira((int)$l['kobo']) . '</span></div>';
    $m = $who['member']; $py = $who['payer'];
    $bank = function_exists('membership_pay_settings') ? membership_pay_settings() : ['bankName' => '', 'accountName' => '', 'accountNumber' => ''];
    $payUrl = function_exists('membership_pay_url') ? membership_pay_url($inv) : '';
    $open = in_array($st['state'], ['due', 'overdue'], true);
    $body = '<article class="sheet iv" data-doc="invoice"><div class="strip"><span></span><span></span></div><div class="in">'
        . doc_org_head($s, 'Invoice', (string)$doc['docNo'])
        . '<section class="hero"><div class="l"><span class="lab">' . ($st['state'] === 'paid' ? 'Total paid' : 'Amount due') . '</span><span class="amt">' . doc_hero($st['state'] === 'paid' ? $kobo : ($st['state'] === 'void' ? 0 : $due)) . '</span><span class="sub">' . doc_e($sub) . '</span></div>'
        . '<span class="pill ' . $pillC . '">' . doc_icon($pillI) . $pillT . '</span></section>'
        . '<section class="parties">'
        . '<div class="f"><span class="k">Billed to</span><span class="v">' . doc_e($py['name']) . '</span>' . ($py['address'] !== '' ? '<span class="s">' . doc_e($py['address']) . '</span>' : '') . ($py['email'] !== '' ? '<span class="s">' . doc_e($py['email']) . '</span>' : '') . '</div>'
        . '<div class="f"><span class="k">For member</span><span class="v">' . doc_e($m['name']) . '</span><span class="s"><span class="mono">' . doc_e($m['id']) . '</span>' . ($m['centre'] !== '' ? ' · ' . doc_e($m['centre']) . ' centre' : '') . '</span>'
        . (($t = implode(' · ', array_filter([$m['track'], $m['level'] !== '' ? 'Level ' . preg_replace('/^level\s*/i', '', $m['level']) : '']))) !== '' ? '<span class="s">' . doc_e($t) . '</span>' : '') . '</div>'
        . '<div class="kv"><span>Issue date</span><span>' . doc_e(doc_local((string)$inv['createdAt'], 'j M Y')) . '</span>'
        . '<span>Date of supply</span><span>' . doc_e(doc_local(((string)$inv['startDate'] ?: substr((string)$inv['createdAt'], 0, 10)) . 'T12:00:00Z', 'j M Y')) . '</span>'
        . '<span>Due date</span><span' . ($st['state'] === 'overdue' ? ' class="late"' : '') . '>' . doc_e(doc_local($st['due'] . 'T12:00:00Z', 'j M Y')) . '</span><span>Type</span><span>B2C · Education</span></div></section>'
        . '<section class="lines"><div class="lh"><span>Description</span><span class="r">Qty</span><span class="r">Unit price</span><span class="r">VAT</span><span class="r">Amount</span></div>' . $rows
        . '<div class="sum"><span class="words"><span>Amount in words:</span> ' . doc_e(doc_words(intdiv($st['state'] === 'paid' ? $kobo : $due, 100))) . '</span><div class="tot">'
        . '<div><span>Subtotal</span><span>' . doc_naira($kobo - $vat) . '</span></div><div><span>' . ($s['vat'] === 'exempt' ? 'VAT (exempt)' : 'VAT 7.5%') . '</span><span>' . doc_naira($vat) . '</span></div>'
        . '<div><span>Total</span><span>' . doc_naira($kobo) . '</span></div><div><span>Paid to date</span><span>' . doc_naira($paid) . '</span></div>'
        . '<div class="grand"><span>Amount due</span><span>' . doc_naira($st['state'] === 'void' ? 0 : $due) . '</span></div></div></div></section>'
        . ($open ? '<section class="pay">'
            . '<div class="card">' . ($payUrl !== '' ? doc_qr_svg($payUrl, 'Pay online code') : '') . '<div class="t"><span class="h">' . doc_icon('card') . 'Pay online</span><span>Card, USSD or transfer via Paystack. Scan, or open:</span>'
            . '<a class="mono" href="' . doc_e($payUrl) . '">' . doc_e(preg_replace('#^https?://#', '', $payUrl)) . '</a></div></div>'
            . ($bank['accountNumber'] !== '' ? '<div class="card col"><span class="h">' . doc_icon('bank') . 'Bank transfer</span><div class="kv"><span>Account name</span><span>' . doc_e($bank['accountName'] ?: $s['legalName']) . '</span>'
              . '<span>Bank</span><span>' . doc_e($bank['bankName']) . '</span><span>Account no.</span><span class="mono">' . doc_e($bank['accountNumber']) . '</span>'
              . '<span>Narration</span><span class="mono">' . doc_e(doc_short((string)$doc['docNo'])) . '</span></div></div>' : '')
            . '</section>' : '')
        . '<section class="foot"><div class="terms"><b>Terms</b><span>Payment due within ' . (int)$s['dueDays'] . ' days of issue. Transfers are confirmed within 2 working days and a receipt is sent to the Family Portal. Late payment may pause access to sessions, as set out in the NGG fees policy accepted at enrolment.</span>'
        . '<span class="mono code">' . doc_e(doc_code_line($doc)) . '</span></div>' . doc_sign($s, $s['feesOfficer'], 'Fees Officer, for ' . $s['legalName']) . '</section>'
        . doc_legal($s, 'Computer-generated invoice, valid without signature or stamp. This is a request for payment, not a receipt.')
        . '</div></article>';
    return doc_page('Invoice ' . $doc['docNo'], $body);
}

/** The formulas behind the certificate's pattern, one per level, in level order. */
function doc_ml_formulas(): array {
    $f = [];
    foreach (mathlab_levels() as $n => $lv) $f[$n] = (string)($lv['formula'] ?? '');
    return array_values(array_filter($f));
}

/** The Math Lab certificate, landscape, from its frozen copy. */
function doc_render_certificate(array $doc): string {
    $d = doc_data($doc); $s = doc_org_for($d); $n = (int)$d['level'];
    $all = doc_ml_formulas(); $pat = '';
    for ($i = 0; $i < 90 && $all; $i++) $pat .= '<span' . ($i % 4 === 1 ? ' class="g"' : '') . '>' . doc_e($all[($i * 5 + $n) % count($all)]) . '</span>';
    $dist = !empty($d['distinction']);
    $sup = (string)$doc['status'] === 'superseded';
    $css = '<style>'
        . '.cert{height:794px}.pat{position:absolute;inset:0;display:grid;grid-template-columns:repeat(5,max-content);gap:20px 30px;padding:26px 0 0 26px;box-sizing:border-box;align-content:start;font:13px "Geist Mono",monospace;color:#1f3263;opacity:.12;pointer-events:none;'
        . '-webkit-mask-image:radial-gradient(90% 100% at 100% 0%,#000 35%,transparent 80%);mask-image:radial-gradient(90% 100% at 100% 0%,#000 35%,transparent 80%)}.pat span{white-space:nowrap}.pat .g{color:#b07a00}'
        . '.glow{position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;background:radial-gradient(closest-side,rgba(251,178,31,.16),rgba(251,178,31,0));pointer-events:none}'
        . '.cg{position:relative;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:56px;padding:56px 64px 40px;min-height:0}.cl{display:flex;flex-direction:column;min-width:0}'
        . '.brand{display:flex;align-items:center;gap:12px}.brand img{width:44px;height:44px}.brand b{display:block;font:700 17px "Bricolage Grotesque",sans-serif;letter-spacing:-.01em}.brand small{display:block;font-size:12.5px;color:#6a7190}'
        . '.lab{margin-top:68px;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#1f3263}.lab i{width:24px;height:3px;border-radius:2px;background:#fbb21f}'
        . '.who{margin-top:14px;font:700 74px/.98 "Bricolage Grotesque",sans-serif;letter-spacing:-.045em;text-wrap:balance}.met{margin-top:26px;font-size:16px;color:#4a5272}'
        . '.lv{margin-top:8px;font:600 30px/1.1 "Bricolage Grotesque",sans-serif;letter-spacing:-.02em;color:#1f3263;text-wrap:balance}.blurb{margin-top:12px;max-width:520px;font-size:14.5px;line-height:1.55;color:#4a5272}'
        . '.sigs{margin-top:auto;display:grid;grid-template-columns:repeat(2,200px);gap:40px}.sigs .line{height:32px}'
        . '.cr{display:flex;flex-direction:column;align-items:center;padding-top:64px}.badge{width:184px;height:204px;position:relative;display:flex;align-items:center;justify-content:center}'
        . '.badge i{position:absolute;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}.badge .h1{inset:-14px;background:rgba(31,50,99,.08)}.badge .h2{inset:0;background:linear-gradient(160deg,#ffd36b,#fbb21f 45%,#d98f00)}.badge .h3{inset:5px;background:linear-gradient(165deg,#2a4382,#1f3263 50%,#0e1630)}'
        . '.badge .c{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff}.badge .c small{font-size:10.5px;font-weight:600;letter-spacing:.2em;color:#c9d1e6}.badge .c b{font:800 64px/.85 "Bricolage Grotesque",sans-serif;letter-spacing:-.04em;color:#fbb21f;font-variant-numeric:tabular-nums}.badge .c span{font-size:11px;font-weight:500;max-width:120px;text-align:center;line-height:1.3}'
        . '.res{margin-top:18px;display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:600}.res i{width:7px;height:7px;border-radius:50%}.r-d{background:#fff4dc;color:#6b4700}.r-d i{background:#fbb21f}.r-p{background:#eef1f8;color:#1f3263}.r-p i{background:#1f3263}'
        . '.det{margin-top:26px;width:100%;box-sizing:border-box;padding:16px 18px;border-radius:16px;background:rgba(246,247,251,.9);border:1px solid #eceef4}'
        . '.cv{margin-top:auto;width:100%;display:flex;align-items:center;gap:12px;padding-top:14px;border-top:1px solid #eceef2}.cv .qr{width:52px;height:52px;flex:none}.cv div{display:flex;flex-direction:column;gap:2px;font-size:11.5px;color:#6a7190;min-width:0}.cv b{font-size:12.5px;font-weight:600;color:#0e1630}'
        . '.bstrip{position:relative;height:8px;display:grid;grid-template-columns:1fr 160px;flex:none}.bstrip span:first-child{background:#1f3263}.bstrip span:last-child{background:#fbb21f}'
        . '.supd{position:absolute;left:64px;top:22px;font-size:12.5px;font-weight:600;color:#8a1c10;background:#ffd6d0;padding:4px 12px;border-radius:999px}'
        . '</style>';
    $body = $css . '<article class="sheet cert" data-doc="certificate"><div class="pat" aria-hidden="true">' . $pat . '</div><div class="glow" aria-hidden="true"></div>'
        . ($sup ? '<span class="supd">Superseded by ' . doc_e((string)$doc['supersededBy']) . '</span>' : '')
        . '<div class="cg"><div class="cl"><div class="brand"><img src="/assets/logo.png" alt="Next Generation Genius"><div><b>Next Generation Genius</b><small>The Math Lab</small></div></div>'
        . '<span class="lab"><i></i>Certificate of achievement</span><span class="who">' . doc_e((string)$d['name']) . '</span>'
        . '<span class="met">has met the assessment standard for</span><span class="lv">Level ' . $n . ': ' . doc_e((string)$d['levelName']) . '</span>'
        . '<span class="blurb">' . doc_e((string)$d['blurb']) . '</span>'
        . '<div class="sigs">' . doc_sign($s, $s['mathlabCoach'], 'Math Lab Coach') . doc_sign($s, $s['programmeDirector'], 'Programme Director') . '</div></div>'
        . '<div class="cr"><div class="badge"><i class="h1"></i><i class="h2"></i><i class="h3"></i><div class="c"><small>MATH LAB</small><b>' . str_pad((string)$n, 2, '0', STR_PAD_LEFT) . '</b><span>' . doc_e((string)$d['strand']) . ' strand</span></div></div>'
        . '<span class="res ' . ($dist ? 'r-d' : 'r-p') . '"><i></i>' . ($dist ? 'Distinction · ' . DOC_DISTINCTION_PCT . '% and above' : 'Pass · ' . MATHLAB_PASS_PCT . '% and above') . '</span>'
        . '<div class="det kv"><span>Assessment</span><span>' . doc_e((string)$d['paper']) . ' paper</span><span>Score</span><span>' . (int)$d['pct'] . '% (' . (int)$d['correct'] . ' of ' . (int)$d['total'] . ')</span>'
        . '<span>Class band</span><span>' . doc_e((string)$d['band']) . '</span><span>Awarded</span><span>' . doc_e(doc_local((string)$d['awarded'], 'j F Y')) . '</span></div>'
        . '<div class="cv">' . doc_qr_svg(doc_verify_url((string)$doc['docNo']), 'Verification code') . '<div><b>Verify at ' . doc_e(preg_replace('#^https?://#', '', doc_origin())) . '/verify</b><span class="mono">' . doc_e((string)$doc['docNo']) . '</span><span class="mono">' . doc_e(doc_code_line($doc)) . '</span></div></div>'
        . '</div></div><div class="bstrip"><span></span><span></span></div></article>';
    return doc_page('Math Lab certificate ' . $doc['docNo'], $body, true);
}

/** Render whatever a private token names. Returns [status, html]. */
function doc_render_token(string $token): array {
    $doc = doc_by('token', $token);
    if (!$doc) return [404, ''];
    if ($doc['kind'] === 'receipt') return [200, doc_render_receipt($doc)];
    if ($doc['kind'] === 'ack') {
        $off = db_row('SELECT * FROM offline_payments WHERE paymentId = ? LIMIT 1', [(string)$doc['docNo']]);
        $inv = $off ? db_row('SELECT * FROM membership_invoices WHERE invoiceId = ? LIMIT 1', [(string)$off['invoiceId']]) : null;
        return $off && $inv ? [200, doc_render_ack($off, $inv, $doc)] : [404, ''];
    }
    if ($doc['kind'] === 'certificate') return [200, doc_render_certificate($doc)];
    $inv = db_row('SELECT * FROM membership_invoices WHERE invoiceId = ? LIMIT 1', [(string)$doc['docNo']]);
    return $inv ? [200, doc_render_invoice($inv, $doc)] : [404, ''];
}
