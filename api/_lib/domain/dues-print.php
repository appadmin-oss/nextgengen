<?php
/**
 * Dues as printable documents (owner, 7 Nov 2026: "We to also be able to export dues in PDF").
 *
 * There is no headless renderer on this host, so a "PDF export" is what the parent report already is: an A4 page
 * drawn in the report's own design system (assets/report/report.css) with a "Print or save as PDF" button. Two:
 *
 *   · The DUES REGISTER — everyone who owes, in the requester's centres, grouped by centre: what each balance is
 *     made of, how old the oldest unpaid charge is, and the last payment. The same figures as "Who owes", read
 *     from admin_fees_arrears() itself, so the PDF can never disagree with the screen it was exported from.
 *   · An ACCOUNT STATEMENT — one member's every charge and payment, what is still owed (oldest due first, the
 *     order a payment settles them) and the balance; from fees_account_statement(), the statement the Control
 *     Room shows. Staff (fees, scoped), the member themself, and a guardian who follows them can open it.
 */

/** The letterhead and title both documents share with the parent report. */
function dues_doc_head(string $title, string $sub, string $badge, string $ref = ''): string {
    $e = static fn($s) => esc_html((string)$s);
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    return '<header><div class="rp-head"><div class="rp-brand"><img class="rp-logo" src="/assets/report/logo.png" alt="" width="48" height="48"><div class="rp-brand-t">'
         . '<span class="rp-brand-n">Next Generation Genius</span><span class="rp-over">An Afrovanguard programme</span></div></div>'
         . '<table class="rp-meta"><tbody>' . ($ref !== '' ? '<tr><th scope="row">Reference</th><td>' . $e($ref) . '</td></tr>' : '')
         . '<tr><th scope="row">Printed</th><td>' . $e(preport_date($today)) . '</td></tr></tbody></table></div><div class="rp-bar"></div></header>'
         . '<div class="rp-title"><div class="rp-title-t"><h1>' . $e($title) . '</h1><p class="rp-sub">' . $e($sub) . '</p></div><span class="rp-badge">' . $e($badge) . '</span></div>';
}

/* ── One member's statement ───────────────────────────────────────────── */

function dues_statement_html(array $m, ?array $cfg = null): string {
    $cfg = $cfg ?? fees_settings();
    $bal = fees_balance($m, $cfg);
    $st = fees_account_statement($m, $bal, $cfg);
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    $payable = max(0, (int)$bal['payable']); $credit = $payable > 0 ? 0 : (int)($st['summary']['credit'] ?? 0);
    $e = static fn($s) => esc_html((string)$s);
    $o = dues_doc_head('Account Statement', 'Dues, fees and fines, as they stand on ' . preport_date($today), $payable > 0 ? 'Balance ' . preport_money($payable) : 'Fully paid', (string)($m['displayId'] ?? '') ?: (string)$m['memberId']);
    $o .= '<table class="rp-kv"><tbody><tr><th scope="row">Member</th><td class="is-name">' . $e($m['fullName']) . '</td><th scope="row">ID number</th><td>' . $e(($m['displayId'] ?? '') ?: '—') . '</td></tr>'
        . '<tr><th scope="row">Centre</th><td>' . $e(($m['centre'] ?? '') ?: '—') . '</td><th scope="row">Programme</th><td>' . $e(($m['type'] ?? '') === 'Summer' ? 'Summer School' : 'NGG Club') . '</td></tr></tbody></table>';
    $S = $st['summary'];
    $fig = static fn($l, $v, $c, $cls = '') => '<div class="rp-fig' . ($cls ? ' ' . $cls : '') . '"><span class="rp-over">' . esc_html($l) . '</span><span class="rp-fig-v">' . esc_html($v) . '</span><span class="rp-fig-c">' . esc_html($c) . '</span></div>';
    $o .= '<section class="rp-sec is-summary" aria-labelledby="ds-s"><h2 id="ds-s">Summary</h2><div class="rp-figs">'
        . $fig('Charged', preport_money((int)$S['chargedTotal']), 'All time')
        . $fig('Paid', preport_money((int)$S['receivedTotal']), 'Payments and waivers')
        . $fig('Still owed', (string)count($st['open']), count($st['open']) === 1 ? 'open charge' : 'open charges')
        . ($payable > 0 ? $fig('Balance due', preport_money($payable), 'On ' . preport_date($today), 'is-money') : $fig($credit > 0 ? 'Credit' : 'Balance due', preport_money($credit), $credit > 0 ? 'On account' : 'All paid', 'is-money'))
        . '</div></section>';
    // Every line, oldest first — a statement reads down to today's balance.
    $rows = [];
    foreach (array_reverse($st['statement']) as $r) {
        $what = function_exists('fees_made_label') ? fees_made_label((string)$r['kind'], (string)$r['note']) : (string)$r['kind'];
        if ($r['kind'] === 'payment') $what = 'Payment received';
        elseif ($r['kind'] === 'waiver') $what = 'Waived';
        elseif ($r['kind'] === 'training_owed') $what = 'Training place (left before the MOU was complete)';
        $note = trim((string)$r['note']);
        $label = $e($what) . ($note !== '' && !in_array($r['kind'], ['dues', 'membership', 'training_owed'], true) && mb_stripos($note, $what) !== 0 ? '<br><span class="is-dim">' . $e(mb_substr($note, 0, 120)) . '</span>' : '');
        if ($r['void']) $label .= '<br><span class="is-dim">Voided' . ($r['voidReason'] !== '' ? ': ' . $e($r['voidReason']) : '') . '</span>';
        $rows[] = [$r['date'] !== '' ? $e(preport_date($r['date'])) : '—', $label,
                   $r['charge'] ? $e(preport_money((int)$r['charge'])) : '', $r['credit'] ? '− ' . $e(preport_money((int)$r['credit'])) : '', $r['void'] ? '<span class="is-dim">—</span>' : $e(preport_money((int)$r['balance']))];
    }
    $o .= '<section class="rp-sec" aria-labelledby="ds-1"><h2 id="ds-1">1. Every charge and payment</h2>'
        . preport_table([['Date', '', 16], ['Item', ''], ['Charge', 'is-num', 15], ['Paid', 'is-num', 15], ['Balance', 'is-num is-mid', 15]], $rows, 'Nothing has been charged or paid on this account.', '', 'Every charge and payment, oldest first') . '</section>';
    $tail = '<tr class="rp-bal"><td class="rp-bal-l">' . $e($payable > 0 ? 'Balance to pay on ' . preport_date($today) : ($credit > 0 ? 'Credit on account' : 'Nothing to pay')) . '</td><td></td><td class="rp-bal-v' . ($credit > 0 ? ' is-credit' : '') . '">'
          . $e(preport_money($payable > 0 ? $payable : $credit)) . '</td></tr>';
    $open = array_map(static fn($x) => [esc_html(function_exists('fees_made_label') ? fees_made_label((string)$x['kind'], (string)$x['note']) : (string)$x['kind']) . (preg_match('/(\d{4})-(\d{2})$/', (string)$x['periodKey'], $pm) ? '<br><span class="is-dim">' . esc_html(gmdate('F Y', (int)strtotime($pm[1] . '-' . $pm[2] . '-01 12:00:00 UTC'))) . '</span>' : ''),
        $x['due'] !== '' ? esc_html(preport_date($x['due'])) : '—', esc_html(preport_money((int)$x['left']))], $st['open']);
    $o .= '<section class="rp-sec" aria-labelledby="ds-2"><h2 id="ds-2">2. Still owed</h2>'
        . preport_table([['Item', ''], ['Due', '', 22], ['Amount', 'is-num', 18]], $open, '', $tail, 'What is still owed, oldest first, and the balance')
        . ($payable > 0 ? '<p class="rp-note">Pay in the family account (Fees) or at the centre desk. A payment settles the oldest charge first. If you have already paid, send the receipt from Fees and it will be matched.</p>' : '')
        . '</section>';
    $o .= '<footer class="rp-foot"><span>Produced from NGG’s accounts records as they stood on ' . $e(preport_date($today)) . '.</span><span>' . $e(($m['displayId'] ?? '') ?: (string)$m['memberId']) . '</span></footer>';
    return preport_document('Account Statement — ' . $m['fullName'], '<div class="rp-page rp">' . $o . '</div>');
}

/** admin.fees.statement.doc — a member's statement as a printable page (fees, scoped to the requester's centres). */
function admin_fees_statement_doc(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = (string)($p['memberId'] ?? '');
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.fees.statement.print', (string)($p['requesterId'] ?? ''), $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'html' => dues_statement_html($m)];
}
/** member.fees.statement.doc — a member's own statement. */
function member_fees_statement_doc(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'html' => dues_statement_html($m)];
}
/** family.statement.doc — the statement of a child the guardian follows (through their own active link). */
function family_statement_doc(array $p): array {
    $m = function_exists('family_ward_member') ? family_ward_member($p) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'html' => dues_statement_html($m)];
}

/* ── The dues register ────────────────────────────────────────────────── */

/** admin.fees.register.doc — everyone who owes, grouped by centre, as a printable page. Optional `centre`. */
function admin_fees_register_doc(array $p): array {
    $a = admin_fees_arrears(['requesterId' => (string)($p['requesterId'] ?? ''), 'limit' => FEES_ARREARS_PAGE_MAX]);
    if (empty($a['ok'])) return $a;
    $centre = trim((string)($p['centre'] ?? ''));
    $rows = $a['arrears'];
    if ($centre !== '') $rows = array_values(array_filter($rows, static fn($r) => strcasecmp((string)$r['centre'], $centre) === 0));
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    $e = static fn($s) => esc_html((string)$s);
    $total = array_sum(array_column($rows, 'payable'));
    $made = ['dues' => 0, 'membership' => 0, 'fine' => 0, 'training' => 0, 'other' => 0];
    foreach ($rows as $r) foreach ($made as $k => $_) $made[$k] += (int)(($r['made'] ?? [])[$k] ?? 0);
    $over90 = count(array_filter($rows, static fn($r) => (int)$r['daysOverdue'] > 90));
    $o = dues_doc_head('Dues Register', 'Every family owing' . ($centre !== '' ? ' at ' . $centre : '') . ', as it stands on ' . preport_date($today), $centre !== '' ? $centre : 'All your centres');
    $fig = static fn($l, $v, $c, $cls = '') => '<div class="rp-fig' . ($cls ? ' ' . $cls : '') . '"><span class="rp-over">' . esc_html($l) . '</span><span class="rp-fig-v">' . esc_html($v) . '</span><span class="rp-fig-c">' . esc_html($c) . '</span></div>';
    $o .= '<section class="rp-sec is-summary" aria-labelledby="dr-s"><h2 id="dr-s">Summary</h2><div class="rp-figs">'
        . $fig('Families owing', (string)count($rows), $a['truncated'] && $centre === '' ? 'The largest ' . count($rows) . ' of ' . $a['matched'] : 'In this register')
        . $fig('Dues', preport_money($made['dues'] + $made['membership']), 'Commitment and membership')
        . $fig('Fines', preport_money($made['fine']), $over90 . ' owing over 90 days')
        . $fig('Total owed', preport_money($total), 'On ' . preport_date($today), 'is-money') . '</div></section>';
    $by = [];
    foreach ($rows as $r) $by[(string)$r['centre'] ?: 'No centre'][] = $r;
    ksort($by);
    $n = 1;
    if (!$by) $o .= '<section class="rp-sec"><h2>Families owing</h2><p class="rp-empty">Nobody owes anything' . ($centre !== '' ? ' at ' . $e($centre) : '') . '.</p></section>';
    foreach ($by as $c => $list) {
        $sum = array_sum(array_column($list, 'payable'));
        $lines = array_map(static function ($r) {
            $m = $r['made'] ?? []; $parts = [];
            foreach (['dues' => 'Dues', 'membership' => 'Membership', 'fine' => 'Fines', 'training' => 'Training', 'other' => 'Other'] as $k => $l) if ((int)($m[$k] ?? 0) > 0) $parts[] = $l . ' ' . preport_money((int)$m[$k]);
            $age = (int)$r['daysOverdue'];
            return [esc_html($r['fullName']) . '<br><span class="is-dim">' . esc_html(($r['displayId'] ?? '') ?: $r['memberId']) . '</span>', esc_html(implode(' · ', $parts) ?: '—'),
                    $r['oldestDue'] !== '' ? [esc_html(preport_date($r['oldestDue'])) . '<br><span class="is-dim">' . $age . ' day' . ($age === 1 ? '' : 's') . '</span>', $age > 90 ? 'is-bad' : ''] : '—',
                    $r['lastPaid'] ? esc_html(preport_date($r['lastPaid']['date'])) . '<br><span class="is-dim">' . esc_html(preport_money((int)$r['lastPaid']['amount'])) . '</span>' : '<span class="is-dim">Never</span>',
                    esc_html(preport_money((int)$r['payable']))];
        }, $list);
        $tail = '<tr class="rp-bal"><td class="rp-bal-l">' . $e($c) . ': ' . count($list) . ' ' . (count($list) === 1 ? 'family' : 'families') . '</td><td></td><td></td><td></td><td class="rp-bal-v">' . $e(preport_money($sum)) . '</td></tr>';
        $o .= '<section class="rp-sec" aria-labelledby="dr-' . $n . '"><h2 id="dr-' . $n . '">' . $n . '. ' . $e($c) . '</h2>'
            . preport_table([['Member', '', 26], ['Made up of', ''], ['Oldest unpaid', '', 16], ['Last payment', '', 16], ['Owed', 'is-num is-strong', 14]], $lines, '', $tail, 'Families owing at ' . $c) . '</section>';
        $n++;
    }
    $o .= '<footer class="rp-foot"><span>Produced from NGG’s accounts records as they stood on ' . $e(preport_date($today)) . '. The same figures as Money → Dues &amp; arrears → Who owes.</span><span>Confidential</span></footer>';
    audit('admin.fees.register.print', (string)($p['requesterId'] ?? ''), $centre !== '' ? $centre : 'all', ['families' => count($rows), 'total' => $total], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'html' => preport_document('Dues Register — ' . ($centre !== '' ? $centre . ' — ' : '') . preport_date($today), '<div class="rp-page rp">' . $o . '</div>')];
}
