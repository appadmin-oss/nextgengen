<?php
/**
 * Managing the NGG shop (owner, 17 Nov 2026: "Upgrade the shop massively … for better and effective management.
 * Research!"). The research and the build order are docs/SHOP-MANAGEMENT-PLAN.md §1–§2; shop.php is the shop
 * itself. This file is what a small volunteer team needs to run it:
 *
 *  - The stock ledger. Every change to a count is a row with a reason, who and when (shop_stock_moves); a
 *    product's stock is the running result. Sales, cancellations, refunds, exchanges, table sales, deliveries in,
 *    damage, give-aways, the product form and the stock-take all write through shop_stock_move(). A low-stock line
 *    per product (or the shop's default), a low-stock panel, and one daily digest email.
 *  - Refunds through Paystack's Refund API, full or partial, with optional restock. Paystack refunds are
 *    asynchronous: a refund is `pending` until Paystack's own answer says `processed` (or `failed`), from the
 *    signed webhook, a staff "check now", or the hourly sweep. Money paid back outside Paystack (a table sale in
 *    cash, a bank transfer) is recorded as such and is processed at once.
 *  - The order's timeline (shop_order_events) and staff notes; exchanges of a size; resending the pay link; unpaid
 *    orders expire after `expireHours` and get at most one reminder.
 *  - Sales at a table (channel 'pos'): the same stock, how it was paid (cash, transfer, POS terminal), and a cash
 *    session per table or day — float, cash taken, expected, counted, difference. A queue is never stalled for a
 *    count: a table sale past the recorded stock goes through, below nought, and says so.
 *  - Reports: the "today" numbers, sales by product and size for a date range, gross / Paystack's fees / refunds /
 *    net, stock value and sell-through, and the orders as CSV.
 *  - Discount codes and pre-orders (a product sells past its stock until its cut-off date; the counts per size are
 *    the print order).
 *
 * Trusts, as in shop.php: stock and the catalogue are `content`; money — orders, refunds, table sales, sessions,
 * codes, reports — is `fees`. A centre-scoped fees holder acts on the collections at their centres only.
 */

const SHOP_MOVE_REASONS = ['sale', 'cancel', 'refund', 'exchange', 'pos', 'received', 'damaged', 'giveaway', 'returned', 'correction', 'recount'];
/** The reasons a person may choose by hand (the rest are written by what happened). */
const SHOP_ADJUST_REASONS = ['received', 'damaged', 'giveaway', 'returned', 'correction'];
const SHOP_STOCKTAKE_MAX = 500;
const SHOP_PAY_METHODS = ['cash', 'transfer', 'pos'];
const SHOP_POS_QTY_MAX = 200;
const SHOP_FLOAT_MAX = 5000000;
const SHOP_EXPORT_MAX = 5000;
const SHOP_REPORT_DAYS_MAX = 366;
const SHOP_CODE_STATUSES = ['active', 'paused', 'archived'];
const SHOP_REMIND_AFTER_HOURS = 2;

/* ── The timeline ─────────────────────────────────────────────────────────── */

function shop_event(string $orderId, string $kind, string $text, string $by = ''): void {
    db_insert('shop_order_events', ['orderId' => $orderId, 'kind' => mb_substr($kind, 0, 16), 'text' => mb_substr($text, 0, 1000), 'byId' => $by, 'createdAt' => now_iso()]);
}

/* ── The stock ledger ─────────────────────────────────────────────────────── */

/**
 * Move one option's stock by $delta for $reason, and record it. The count is written compare-and-set against the
 * value read, so two sales at once cannot lose one. Returns the balance after, or null for a product with no limit.
 */
function shop_stock_move(string $productId, string $variant, int $delta, string $reason, string $note = '', string $orderId = '', string $by = ''): ?int {
    for ($try = 0; $try < 5; $try++) {
        $p = shop_product($productId); if (!$p) return null;
        $raw = (string)$p['stock']; if ($raw === '') return null;
        $s = json_decode($raw, true); $s = is_array($s) ? $s : [];
        $after = (int)($s[$variant] ?? 0) + $delta;
        $s[$variant] = $after;
        $won = db_exec('UPDATE shop_products SET stock = ?, updatedAt = ? WHERE productId = ? AND stock = ?',
            [json_encode($s, JSON_UNESCAPED_UNICODE), now_iso(), $productId, $raw]);
        if ($won) {
            if ($delta !== 0) db_insert('shop_stock_moves', ['productId' => $productId, 'variant' => $variant, 'delta' => $delta, 'balance' => $after,
                'reason' => in_array($reason, SHOP_MOVE_REASONS, true) ? $reason : 'correction', 'note' => mb_substr($note, 0, 300), 'orderId' => $orderId, 'byId' => $by, 'createdAt' => now_iso()]);
            return $after;
        }
    }
    return null;
}
/** Set counts (option => n) as ledger rows of the difference: the product form and the stock-take. */
function shop_stock_set_counts(string $productId, array $counts, string $reason, string $note, string $by): array {
    $p = shop_product($productId); $have = $p ? (shop_stock_raw($p) ?? []) : [];
    $changed = [];
    foreach ($counts as $opt => $n) {
        $d = (int)$n - (int)($have[(string)$opt] ?? 0);
        if ($d !== 0) { shop_stock_move($productId, (string)$opt, $d, $reason, $note, '', $by); $changed[(string)$opt] = $d; }
    }
    return $changed;
}
/** The low-stock line for a product: its own, or the shop's default; null when it never warns. */
function shop_low_at(array $p, ?int $def = null): ?int {
    $own = (int)($p['lowStock'] ?? -1);
    $n = $own >= 0 ? $own : ($def ?? (int)shop_settings()['lowStockDefault']);
    return $n > 0 ? $n : null;
}
/** Every option with a limit: what is on hand, its line, and whether it is fine, low or out. One read. */
function shop_variant_rows(bool $liveOnly = false): array {
    $def = (int)shop_settings()['lowStockDefault']; $out = [];
    foreach (db_all("SELECT * FROM shop_products WHERE stock <> '' AND status <> 'retired'" . ($liveOnly ? " AND status = 'live'" : '') . ' ORDER BY sort, name') as $p) {
        $raw = shop_stock_raw($p); if ($raw === null) continue;
        $line = shop_low_at($p, $def);
        foreach ($raw as $opt => $n) {
            $state = $n <= 0 ? 'out' : ($line !== null && $n <= $line ? 'low' : 'ok');
            $out[] = ['productId' => (string)$p['productId'], 'name' => (string)$p['name'], 'variant' => (string)$opt, 'onHand' => $n,
                'lowAt' => $line, 'state' => $state, 'status' => (string)$p['status'], 'price' => (int)$p['price'], 'preorder' => shop_preorder_open($p)];
        }
    }
    return $out;
}
function shop_move_public(array $m, array $names = []): array {
    return ['id' => (int)$m['id'], 'productId' => (string)$m['productId'], 'name' => $names[(string)$m['productId']] ?? (string)$m['productId'], 'variant' => (string)$m['variant'],
        'delta' => (int)$m['delta'], 'balance' => (int)$m['balance'], 'reason' => (string)$m['reason'], 'note' => (string)$m['note'],
        'orderId' => (string)$m['orderId'], 'by' => (string)$m['byId'], 'byName' => shop_person_name((string)$m['byId']), 'at' => (string)$m['createdAt']];
}
function shop_person_name(string $id): string {
    static $cache = [];
    if ($id === '' ) return '';
    if (!array_key_exists($id, $cache)) $cache[$id] = (string)(db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$id])['fullName'] ?? $id);
    return $cache[$id];
}
function shop_product_names(): array {
    $n = []; foreach (db_all('SELECT productId, name FROM shop_products') as $r) $n[(string)$r['productId']] = (string)$r['name'];
    return $n;
}

/** admin.shop.stock — every limited option with its state, and the latest movements. A read: content or fees. */
function admin_shop_stock(array $p): array {
    $g = admin_cap_gate_any($p, ['content', 'fees']); if (!$g['ok']) return $g;
    $rows = shop_variant_rows();
    $names = shop_product_names();
    $moves = array_map(static fn($m) => shop_move_public($m, $names), db_all('SELECT * FROM shop_stock_moves ORDER BY id DESC LIMIT 60'));
    $value = 0; foreach ($rows as $r) $value += max(0, $r['onHand']) * $r['price'];
    return ['ok' => true, 'variants' => $rows, 'moves' => $moves, 'reasons' => SHOP_ADJUST_REASONS, 'allReasons' => SHOP_MOVE_REASONS,
        'counts' => ['low' => count(array_filter($rows, static fn($r) => $r['state'] === 'low')), 'out' => count(array_filter($rows, static fn($r) => $r['state'] === 'out'))],
        'stockValue' => $value, 'lowStockDefault' => (int)shop_settings()['lowStockDefault'], 'bounds' => ['stocktakeMax' => SHOP_STOCKTAKE_MAX, 'stockMax' => SHOP_STOCK_MAX],
        'canAdjust' => !empty(admin_cap_gate($p, 'content')['ok'])];
}
/** admin.shop.stock.history — one product's ledger (optionally one option), newest first. */
function admin_shop_stock_history(array $p): array {
    $g = admin_cap_gate_any($p, ['content', 'fees']); if (!$g['ok']) return $g;
    $pr = shop_product((string)($p['productId'] ?? '')); if (!$pr) return ['ok' => false, 'error' => 'not_found'];
    $args = [(string)$pr['productId']]; $w = '';
    if (array_key_exists('variant', $p) && $p['variant'] !== null && (string)$p['variant'] !== '*') { $w = ' AND variant = ?'; $args[] = (string)$p['variant']; }
    $lim = max(1, min(500, (int)($p['limit'] ?? 200)));
    $names = [(string)$pr['productId'] => (string)$pr['name']];
    return ['ok' => true, 'product' => ['productId' => (string)$pr['productId'], 'name' => (string)$pr['name'], 'onHand' => shop_stock_raw($pr), 'options' => shop_options($pr)],
        'moves' => array_map(static fn($m) => shop_move_public($m, $names), db_all('SELECT * FROM shop_stock_moves WHERE productId = ?' . $w . ' ORDER BY id DESC LIMIT ' . $lim, $args))];
}
/** admin.shop.stock.adjust — a delivery in, damage, a give-away, a return to the shelf, a correction. Content. */
function admin_shop_stock_adjust(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $pr = shop_product((string)($p['productId'] ?? '')); if (!$pr) return ['ok' => false, 'error' => 'not_found'];
    if (shop_stock_raw($pr) === null) return ['ok' => false, 'error' => 'untracked', 'detail' => 'This product has no stock limit. Turn “Limited stock” on in the product first.'];
    $v = (string)($p['variant'] ?? '');
    if (!in_array($v, shop_options($pr), true)) return ['ok' => false, 'error' => 'bad_option'];
    $reason = (string)($p['reason'] ?? '');
    if (!in_array($reason, SHOP_ADJUST_REASONS, true)) return ['ok' => false, 'error' => 'bad_reason'];
    $delta = (int)($p['delta'] ?? 0);
    if ($delta === 0 || abs($delta) > SHOP_STOCK_MAX) return ['ok' => false, 'error' => 'bad_delta', 'detail' => 'A change other than nought, at most ' . number_format(SHOP_STOCK_MAX) . '.'];
    if (in_array($reason, ['received', 'returned'], true) && $delta < 0) return ['ok' => false, 'error' => 'bad_delta', 'detail' => 'Stock received or returned adds to the count.'];
    if (in_array($reason, ['damaged', 'giveaway'], true) && $delta > 0) return ['ok' => false, 'error' => 'bad_delta', 'detail' => 'Damage and give-aways take from the count.'];
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 300));
    if ($reason === 'correction' && mb_strlen($note) < 3) return ['ok' => false, 'error' => 'note_required', 'detail' => 'Say what the correction is for.'];
    $by = (string)$g['requester']['memberId'];
    $after = shop_stock_move((string)$pr['productId'], $v, $delta, $reason, $note, '', $by);
    if ($after === null) return ['ok' => false, 'error' => 'changed'];
    audit('admin.shop.stock.adjust', $by, (string)$pr['productId'], ['variant' => $v, 'delta' => $delta, 'reason' => $reason, 'after' => $after], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'balance' => $after];
}
/**
 * admin.shop.stocktake — counted numbers for many options at once. The whole list is validated before anything is
 * written; each difference becomes a 'recount' row; options that already matched are reported as unchanged. One
 * audit event for the count.
 */
function admin_shop_stocktake(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $in = is_array($p['counts'] ?? null) ? $p['counts'] : [];
    if (!$in) return ['ok' => false, 'error' => 'empty'];
    if (count($in) > SHOP_STOCKTAKE_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . SHOP_STOCKTAKE_MAX . ' lines in one count.'];
    $plan = []; $results = [];
    foreach ($in as $i => $c) {
        $pid = (string)($c['productId'] ?? ''); $v = (string)($c['variant'] ?? ''); $n = $c['counted'] ?? null;
        $pr = $pid !== '' ? shop_product($pid) : null;
        $err = !$pr ? 'not_found' : (shop_stock_raw($pr) === null ? 'untracked' : (!in_array($v, shop_options($pr), true) ? 'bad_option'
            : (!is_numeric($n) || (int)$n < 0 || (int)$n > SHOP_STOCK_MAX || (string)(int)$n !== (string)$n && !is_int($n) ? 'bad_count' : '')));
        if ($err !== '') $results[] = ['productId' => $pid, 'variant' => $v, 'ok' => false, 'error' => $err];
        else $plan[] = [$pr, $v, (int)$n];
    }
    if ($results) return ['ok' => false, 'error' => 'invalid', 'detail' => 'Nothing was changed: ' . count($results) . ' line' . (count($results) === 1 ? ' is' : 's are') . ' not valid.', 'results' => $results];
    $by = (string)$g['requester']['memberId']; $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 300)) ?: 'Stock-take.';
    $changed = 0; $same = 0; $net = 0;
    foreach ($plan as [$pr, $v, $n]) {
        $have = (shop_stock_raw(shop_product((string)$pr['productId'])) ?? [])[$v] ?? 0;
        if ($have === $n) { $same++; $results[] = ['productId' => (string)$pr['productId'], 'variant' => $v, 'ok' => true, 'unchanged' => true]; continue; }
        shop_stock_move((string)$pr['productId'], $v, $n - $have, 'recount', $note, '', $by);
        $changed++; $net += $n - $have;
        $results[] = ['productId' => (string)$pr['productId'], 'variant' => $v, 'ok' => true, 'delta' => $n - $have];
    }
    audit('admin.shop.stocktake', $by, 'shop', ['lines' => count($plan), 'changed' => $changed, 'unchanged' => $same, 'net' => $net], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'changed' => $changed, 'unchanged' => $same, 'net' => $net, 'results' => $results];
}

/** Once a Lagos day: the low and sold-out options, to whoever keeps the stock and the money. */
function shop_lowstock_digest(bool $force = false): int {
    $s = shop_settings();
    if (!$s['lowStockDigest'] && !$force) return 0;
    $day = gmdate('Y-m-d', time() + 3600);
    if (!$force && (string)setting_raw('shop_digest_day') === $day) return 0;
    if (!$force && (int)gmdate('G', time() + 3600) < 7) return 0;   // after 7 in the morning, Lagos
    $rows = array_values(array_filter(shop_variant_rows(true), static fn($r) => $r['state'] !== 'ok' && !$r['preorder']));
    setting_set('shop_digest_day', $day, 'system');
    if (!$rows || !function_exists('send_mail')) return 0;
    $to = [];
    foreach (array_merge(staff_with_cap('fees'), staff_with_cap('content')) as $m) if ((string)$m['email'] !== '') $to[strtolower((string)$m['email'])] = $m;
    $tr = implode('', array_map(static fn($r) => '<tr><td>' . esc_html($r['name'] . ($r['variant'] !== '' ? ' (' . $r['variant'] . ')' : '')) . '</td><td align="right">' . ($r['onHand'] <= 0 ? 'Sold out' : (int)$r['onHand'] . ' left') . '</td></tr>', $rows));
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $n = 0;
    foreach ($to as $email => $m) {
        $out = count(array_filter($rows, static fn($r) => $r['state'] === 'out'));
        $subject = 'NGG shop: ' . count($rows) . ' item' . (count($rows) === 1 ? '' : 's') . ' low on stock' . ($out ? ' (' . $out . ' sold out)' : '');
        if (@send_mail($email, $subject, email_template(['title' => $subject, 'intro' => 'These items on sale are at or below their low-stock line. Restock them, or take them off sale.',
            'bodyHtml' => '<table role="presentation" width="100%" cellpadding="4" cellspacing="0" border="0">' . $tr . '</table>',
            'ctaUrl' => $origin . '/control/shop/shop-stock', 'ctaLabel' => 'Open the stock']))) $n++;
    }
    return $n;
}

/* ── Discount codes (fees) ────────────────────────────────────────────────── */

function shop_code_norm(string $c): string { return strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', $c)); }
/** Price a code against a subtotal: the discount, or the reason it does not apply, by name. */
function shop_code_apply(string $code, int $sub, string $email = ''): array {
    $c = shop_code_norm($code);
    $row = $c !== '' ? db_row('SELECT * FROM shop_codes WHERE code = ? LIMIT 1', [$c]) : null;
    if (!$row || (string)$row['status'] !== 'active') return ['ok' => false, 'error' => 'bad_code', 'detail' => 'That code is not valid.'];
    $today = gmdate('Y-m-d', time() + 3600);
    if ((string)$row['startsAt'] !== '' && $today < (string)$row['startsAt']) return ['ok' => false, 'error' => 'bad_code', 'detail' => 'That code starts on ' . $row['startsAt'] . '.'];
    if ((string)$row['endsAt'] !== '' && $today > (string)$row['endsAt']) return ['ok' => false, 'error' => 'bad_code', 'detail' => 'That code has ended.'];
    if ((int)$row['maxUses'] > 0 && (int)$row['used'] >= (int)$row['maxUses']) return ['ok' => false, 'error' => 'code_used_up', 'detail' => 'That code has been used as many times as it can be.'];
    if ($sub < (int)$row['minSpend']) return ['ok' => false, 'error' => 'code_min_spend', 'detail' => 'That code needs ₦' . number_format((int)$row['minSpend']) . ' of goods or more.'];
    if ((int)$row['perBuyer'] === 1 && $email !== '' && db_row("SELECT 1 FROM shop_orders WHERE discountCode = ? AND lower(email) = ? AND paidAt <> '' LIMIT 1", [$c, $email]))
        return ['ok' => false, 'error' => 'code_already_used', 'detail' => 'That code can be used once per buyer, and this email has used it.'];
    $d = (string)$row['kind'] === 'percent' ? intdiv($sub * (int)$row['amount'], 100) : (int)$row['amount'];
    // Something is always left to pay: Paystack takes no payment of nought.
    $d = max(0, min($d, $sub - 100));
    return ['ok' => true, 'code' => $c, 'discount' => $d];
}
function shop_code_public(array $r): array {
    return ['code' => (string)$r['code'], 'kind' => (string)$r['kind'], 'amount' => (int)$r['amount'], 'maxUses' => (int)$r['maxUses'], 'perBuyer' => (int)$r['perBuyer'] === 1,
        'minSpend' => (int)$r['minSpend'], 'startsAt' => (string)$r['startsAt'], 'endsAt' => (string)$r['endsAt'], 'status' => (string)$r['status'],
        'used' => (int)$r['used'], 'note' => (string)$r['note'], 'updatedAt' => (string)$r['updatedAt']];
}
function admin_shop_codes(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $given = [];
    foreach (db_all("SELECT discountCode, SUM(discount) d FROM shop_orders WHERE discountCode <> '' AND paidAt <> '' GROUP BY discountCode") as $r) $given[(string)$r['discountCode']] = (int)$r['d'];
    return ['ok' => true, 'statuses' => SHOP_CODE_STATUSES, 'codes' => array_map(static fn($r) => shop_code_public($r) + ['given' => $given[(string)$r['code']] ?? 0],
        db_all("SELECT * FROM shop_codes ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, code LIMIT 500"))];
}
/** admin.shop.code.save — create or change a code; validated whole. The use count is the shop's, never the form's. */
function admin_shop_code_save(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $code = shop_code_norm((string)($d['code'] ?? ''));
    if (strlen($code) < 3 || strlen($code) > 24) return ['ok' => false, 'error' => 'bad_code_name', 'detail' => 'A code of 3 to 24 letters, numbers or dashes.'];
    $cur = db_row('SELECT * FROM shop_codes WHERE code = ? LIMIT 1', [$code]);
    if (!empty($d['isNew']) && $cur) return ['ok' => false, 'error' => 'code_exists', 'detail' => 'There is already a code ' . $code . '.'];
    $kind = (string)($d['kind'] ?? 'percent'); if (!in_array($kind, ['percent', 'fixed'], true)) return ['ok' => false, 'error' => 'bad_kind'];
    $amt = (int)($d['amount'] ?? 0);
    if ($kind === 'percent' && ($amt < 1 || $amt > 100)) return ['ok' => false, 'error' => 'bad_amount', 'detail' => 'A percentage from 1 to 100.'];
    if ($kind === 'fixed' && ($amt < 1 || $amt > SHOP_PRICE_MAX)) return ['ok' => false, 'error' => 'bad_amount', 'detail' => 'An amount from ₦1 to ₦' . number_format(SHOP_PRICE_MAX) . '.'];
    $max = (int)($d['maxUses'] ?? 0); $min = (int)($d['minSpend'] ?? 0);
    if ($max < 0 || $max > 100000) return ['ok' => false, 'error' => 'bad_max_uses'];
    if ($min < 0 || $min > SHOP_PRICE_MAX) return ['ok' => false, 'error' => 'bad_min_spend'];
    $dates = [];
    foreach (['startsAt', 'endsAt'] as $k) {
        $v = trim((string)($d[$k] ?? ''));
        if ($v !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !checkdate((int)substr($v, 5, 2), (int)substr($v, 8, 2), (int)substr($v, 0, 4)))) return ['ok' => false, 'error' => 'bad_date', 'detail' => 'Dates as YYYY-MM-DD.'];
        $dates[$k] = $v;
    }
    if ($dates['startsAt'] !== '' && $dates['endsAt'] !== '' && $dates['endsAt'] < $dates['startsAt']) return ['ok' => false, 'error' => 'bad_date', 'detail' => 'The end comes before the start.'];
    $status = (string)($d['status'] ?? ($cur['status'] ?? 'active')); if (!in_array($status, SHOP_CODE_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    $row = ['kind' => $kind, 'amount' => $amt, 'maxUses' => $max, 'perBuyer' => !empty($d['perBuyer']) ? 1 : 0, 'minSpend' => $min,
        'startsAt' => $dates['startsAt'], 'endsAt' => $dates['endsAt'], 'status' => $status, 'note' => trim(mb_substr((string)($d['note'] ?? ''), 0, 300)),
        'byId' => (string)$g['requester']['memberId'], 'updatedAt' => now_iso()];
    if ($cur) db_update('shop_codes', $row, ['code' => $code]);
    else db_insert('shop_codes', $row + ['code' => $code, 'used' => 0, 'createdAt' => now_iso()]);
    audit('admin.shop.code.save', $g['requester']['memberId'], $code, $row + ['new' => !$cur], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'code' => shop_code_public(db_row('SELECT * FROM shop_codes WHERE code = ?', [$code]))];
}

/* ── Refunds (fees) ───────────────────────────────────────────────────────── */

/** What the buyer was charged in all: the goods and delivery, plus the Paystack charge they bore (online only). */
function shop_charged(array $o): int { return (int)$o['total'] + ((string)($o['channel'] ?? 'online') === 'online' ? (int)$o['processingFee'] : 0); }
/** Refunds that are not failed: what is already promised back. */
function shop_refund_committed(string $orderId): int {
    return (int)(db_row("SELECT COALESCE(SUM(amount), 0) s FROM shop_refunds WHERE orderId = ? AND status <> 'failed'", [$orderId])['s'] ?? 0);
}
/** Per line: how many have come back to the shelf already (refund restocks, and the whole order when a paid one was cancelled). */
function shop_returned_by_line(array $o): array {
    $lines = shop_lines($o); $back = array_fill(0, count($lines), 0);
    if ((string)$o['status'] === 'cancelled' && (string)$o['paidAt'] !== '') { foreach ($lines as $i => $l) $back[$i] = (int)$l['qty']; return $back; }
    foreach (db_all("SELECT restock FROM shop_refunds WHERE orderId = ? AND status <> 'failed'", [(string)$o['orderId']]) as $r)
        foreach ((json_decode((string)$r['restock'], true) ?: []) as $x) { $i = (int)($x['i'] ?? -1); if (isset($back[$i])) $back[$i] += (int)($x['qty'] ?? 0); }
    return $back;
}
/** The refund terms the Control Room shows: the most that can go back, the suggested amount, and the lines. */
function shop_refund_terms(array $o): array {
    $charged = shop_charged($o); $done = shop_refund_committed((string)$o['orderId']);
    $max = max(0, $charged - $done);
    $back = shop_returned_by_line($o);
    return ['charged' => $charged, 'committed' => $done, 'max' => $max, 'suggested' => max(0, min($max, (int)$o['total'] - $done)),
        'paystack' => (string)($o['channel'] ?? 'online') === 'online' && (string)$o['paystackRef'] !== '',
        'lines' => array_map(static fn($l, $i) => ['i' => $i, 'name' => (string)$l['name'], 'option' => (string)$l['option'], 'qty' => (int)$l['qty'], 'returned' => $back[$i] ?? 0], shop_lines($o), array_keys(shop_lines($o)))];
}
/** Recompute the order's refunded total and refund state from its refunds. */
function shop_refund_recalc(string $orderId): void {
    $o = shop_order_by('orderId', $orderId); if (!$o) return;
    $done = (int)(db_row("SELECT COALESCE(SUM(amount), 0) s FROM shop_refunds WHERE orderId = ? AND status = 'processed'", [$orderId])['s'] ?? 0);
    $open = (bool)db_row("SELECT 1 FROM shop_refunds WHERE orderId = ? AND status IN ('pending','processing') LIMIT 1", [$orderId]);
    $state = $open ? 'pending' : ($done > 0 && $done >= (int)$o['total'] ? 'full' : ($done > 0 ? 'partial'
        : ((string)$o['status'] === 'cancelled' && (string)$o['paidAt'] !== '' ? 'due' : '')));
    db_update('shop_orders', ['refunded' => $done, 'refundState' => $state, 'updatedAt' => now_iso()], ['orderId' => $orderId]);
}
/**
 * Start a refund: Paystack's Refund API (`paystack`) or money paid back another way (`outside`). Validated whole
 * before anything moves; restocked lines go back to the shelf at once (the goods are back whatever the bank does).
 */
function shop_refund_start(array $g, array $o, ?int $amount, string $method, string $reason, array $restock, bool $fromCancel = false): array {
    if ((string)$o['paidAt'] === '') return ['ok' => false, 'error' => 'not_paid', 'detail' => 'Only a paid order can be refunded.'];
    if (!in_array($method, ['paystack', 'outside'], true)) return ['ok' => false, 'error' => 'bad_method'];
    $t = shop_refund_terms($o);
    if ($method === 'paystack' && !$t['paystack']) return ['ok' => false, 'error' => 'not_paystack', 'detail' => 'This sale was not paid through Paystack. Record the refund as paid outside.'];
    if ($method === 'paystack' && paystack_secret() === '') return ['ok' => false, 'error' => 'payments_unavailable'];
    $amt = $amount ?? $t['suggested'];
    if ($amt < 1 || $amt > $t['max']) return ['ok' => false, 'error' => 'bad_amount', 'detail' => $t['max'] > 0 ? 'Refund between ₦1 and ₦' . number_format($t['max']) . '.' : 'Everything paid has already been refunded.'];
    if (mb_strlen($reason) < 3) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why it is refunded.'];
    $plan = [];
    foreach ($restock as $x) {
        $i = (int)($x['i'] ?? -1); $q = (int)($x['qty'] ?? 0);
        if ($q === 0) continue;
        $line = $t['lines'][$i] ?? null;
        if (!$line || $q < 0 || $q > $line['qty'] - $line['returned']) return ['ok' => false, 'error' => 'bad_restock', 'detail' => 'Put back at most what was bought and not yet returned.'];
        $plan[] = ['i' => $i, 'qty' => $q];
    }
    $by = (string)$g['requester']['memberId']; $oid = (string)$o['orderId'];
    $rid = 'RFD-' . strtoupper(rand_hex(5));
    $gatewayId = ''; $status = 'processed';
    if ($method === 'paystack') {
        $r = paystack_http('POST', '/refund', ['transaction' => (string)$o['paystackRef'], 'amount' => $amt * 100, 'merchant_note' => mb_substr($reason, 0, 200)]);
        if (empty($r['status'])) return ['ok' => false, 'error' => 'refund_failed', 'detail' => 'Paystack did not accept the refund: ' . mb_substr((string)($r['message'] ?? $r['error'] ?? 'no answer'), 0, 160) . '.'];
        $gatewayId = (string)($r['data']['id'] ?? '');
        $st = (string)($r['data']['status'] ?? 'pending');
        $status = $st === 'processed' ? 'processed' : ($st === 'failed' ? 'failed' : ($st === 'processing' ? 'processing' : 'pending'));
    }
    db_insert('shop_refunds', ['refundId' => $rid, 'orderId' => $oid, 'amount' => $amt, 'method' => $method, 'status' => $status, 'gatewayId' => $gatewayId,
        'reason' => mb_substr($reason, 0, 300), 'restock' => json_encode($plan), 'byId' => $by, 'createdAt' => now_iso(), 'updatedAt' => now_iso(),
        'processedAt' => $status === 'processed' ? now_iso() : '']);
    foreach ($plan as $x) { $l = shop_lines($o)[$x['i']]; shop_stock_move((string)$l['productId'], (string)$l['option'], $x['qty'], 'refund', $rid, $oid, $by); }
    shop_event($oid, 'refund', ($method === 'paystack' ? 'Refund of ₦' . number_format($amt) . ' sent to Paystack (' . $status . ')' : 'Refund of ₦' . number_format($amt) . ' paid back outside Paystack')
        . ': ' . $reason . ($plan ? ' · ' . array_sum(array_column($plan, 'qty')) . ' item(s) back on the shelf.' : '.'), $by);
    shop_refund_recalc($oid);
    if ($status === 'processed') shop_mail_buyer(shop_order_by('orderId', $oid) + ['__refund' => $amt, '__refundMethod' => $method], 'refunded');
    audit('admin.shop.refund', $by, $oid, ['refundId' => $rid, 'amount' => $amt, 'method' => $method, 'status' => $status, 'restock' => $plan, 'fromCancel' => $fromCancel]);
    return ['ok' => true, 'refundId' => $rid, 'status' => $status, 'amount' => $amt];
}
/** admin.shop.refund — full (no amount) or partial, through Paystack or recorded as paid outside, with restock. */
function admin_shop_refund(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $o = shop_order_by('orderId', (string)($p['orderId'] ?? '')); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    $amt = array_key_exists('amount', $p) && $p['amount'] !== null && $p['amount'] !== '' ? (int)$p['amount'] : null;
    $r = shop_refund_start($g, $o, $amt, (string)($p['method'] ?? 'paystack'), trim(mb_substr((string)($p['reason'] ?? ''), 0, 300)), is_array($p['restock'] ?? null) ? $p['restock'] : []);
    if (!empty($r['ok'])) $r['order'] = shop_order_admin(shop_order_by('orderId', (string)$o['orderId']));
    return $r;
}
/** Move a refund on, forward only, from Paystack's own word. Processed once: the buyer is emailed once. */
function shop_refund_apply(array $row, string $status): bool {
    $map = ['pending' => 'pending', 'processing' => 'processing', 'processed' => 'processed', 'failed' => 'failed', 'needs-attention' => 'processing'];
    $to = $map[$status] ?? ''; if ($to === '' || $to === (string)$row['status']) return false;
    if (!in_array((string)$row['status'], ['pending', 'processing'], true)) return false;   // processed and failed are final
    if ($to === 'pending') return false;
    $won = db_exec("UPDATE shop_refunds SET status = ?, updatedAt = ?, processedAt = ? WHERE refundId = ? AND status IN ('pending','processing')",
        [$to, now_iso(), $to === 'processed' ? now_iso() : '', (string)$row['refundId']]);
    if (!$won) return false;
    $oid = (string)$row['orderId'];
    if ($to === 'processed') shop_event($oid, 'refund', 'Paystack processed the refund of ₦' . number_format((int)$row['amount']) . '.');
    if ($to === 'failed') shop_event($oid, 'refund', 'Paystack could not refund ₦' . number_format((int)$row['amount']) . '. The money is still due; refund it another way.');
    shop_refund_recalc($oid);
    if ($to === 'processed') shop_mail_buyer(shop_order_by('orderId', $oid) + ['__refund' => (int)$row['amount'], '__refundMethod' => 'paystack'], 'refunded');
    if ($to === 'failed') { $o = shop_order_by('orderId', $oid); if ($o && (string)$o['refundState'] === '' && (string)$o['status'] !== 'cancelled') db_update('shop_orders', ['refundState' => 'due'], ['orderId' => $oid]); }
    audit('shop.refund.' . $to, 'paystack', $oid, ['refundId' => (string)$row['refundId'], 'amount' => (int)$row['amount']]);
    return true;
}
/** Ask Paystack where a refund is, and apply its answer. */
function shop_refund_poll(array $row): string {
    if ((string)$row['method'] !== 'paystack' || (string)$row['gatewayId'] === '') return (string)$row['status'];
    $r = paystack_http('GET', '/refund/' . rawurlencode((string)$row['gatewayId']));
    $st = (string)($r['data']['status'] ?? '');
    if (!empty($r['status']) && $st !== '') shop_refund_apply($row, $st);
    return (string)(db_row('SELECT status FROM shop_refunds WHERE refundId = ?', [(string)$row['refundId']])['status'] ?? $row['status']);
}
/**
 * The signed webhook's refund.* events (api/hooks/paystack.php). The body says which refund; Paystack's own GET
 * says where it is — the body's status is never trusted on its own, as with charges. A repeated delivery is a no-op.
 */
function shop_refund_event(array $evt): bool {
    $d = is_array($evt['data'] ?? null) ? $evt['data'] : [];
    $ref = (string)($d['transaction_reference'] ?? ($d['transaction']['reference'] ?? ''));
    $gid = (string)($d['id'] ?? '');
    $row = $gid !== '' ? db_row('SELECT * FROM shop_refunds WHERE gatewayId = ? LIMIT 1', [$gid]) : null;
    if (!$row && $ref !== '') {
        $o = shop_order_by('paystackRef', $ref);
        if ($o) $row = db_row("SELECT * FROM shop_refunds WHERE orderId = ? AND method = 'paystack' AND status IN ('pending','processing') AND (gatewayId = '' OR gatewayId = ?) ORDER BY id LIMIT 1", [(string)$o['orderId'], $gid]);
        if ($row && $gid !== '' && (string)$row['gatewayId'] === '') { db_update('shop_refunds', ['gatewayId' => $gid], ['refundId' => (string)$row['refundId']]); $row['gatewayId'] = $gid; }
    }
    if (!$row) return false;
    shop_refund_poll($row);
    return true;
}
/** admin.shop.refund.check — "check with Paystack now" for one refund. */
function admin_shop_refund_check(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM shop_refunds WHERE refundId = ? LIMIT 1', [(string)($p['refundId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $o = shop_order_by('orderId', (string)$row['orderId']);
    if ($o && !shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    return ['ok' => true, 'status' => shop_refund_poll($row)];
}

/* ── Unpaid orders ────────────────────────────────────────────────────────── */

/** Cancel online orders left unpaid past `expireHours`. They held no stock; a payment that still arrives revives one. */
function shop_expire_pending(): int {
    $h = (int)shop_settings()['expireHours'];
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - $h * 3600);
    $n = 0;
    foreach (db_all("SELECT orderId FROM shop_orders WHERE status = 'pending' AND channel = 'online' AND createdAt <> '' AND createdAt < ? ORDER BY id LIMIT 200", [$cut]) as $r) {
        if (db_exec("UPDATE shop_orders SET status = 'cancelled', cancelKind = 'expired', cancelledAt = ?, updatedAt = ? WHERE orderId = ? AND status = 'pending'", [now_iso(), now_iso(), (string)$r['orderId']])) {
            shop_event((string)$r['orderId'], 'expired', 'Cancelled: not paid within ' . $h . ' hours.'); $n++;
        }
    }
    return $n;
}
/** The one reminder an unpaid buyer gets (the cron), with the link to pay. */
function shop_remind_unpaid(int $max = 30): int {
    if (!shop_settings()['remindUnpaid']) return 0;
    $h = (int)shop_settings()['expireHours'];
    $old = gmdate('Y-m-d\TH:i:s\Z', time() - SHOP_REMIND_AFTER_HOURS * 3600);
    $n = 0;
    foreach (db_all("SELECT * FROM shop_orders WHERE status = 'pending' AND channel = 'online' AND remindedAt = '' AND email <> '' AND createdAt < ? AND createdAt > ? ORDER BY id LIMIT " . max(1, $max),
        [$old, gmdate('Y-m-d\TH:i:s\Z', time() - $h * 3600)]) as $o) {
        if (!db_exec("UPDATE shop_orders SET remindedAt = ? WHERE orderId = ? AND remindedAt = ''", [now_iso(), (string)$o['orderId']])) continue;
        shop_mail_buyer($o, 'remind'); shop_event((string)$o['orderId'], 'remind', 'The buyer was reminded to pay.'); $n++;
    }
    return $n;
}
/** admin.shop.order.remind — staff send the pay link again (at most once an hour). */
function admin_shop_order_remind(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $o = shop_order_by('orderId', (string)($p['orderId'] ?? '')); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$o['status'] !== 'pending' || (string)$o['channel'] !== 'online') return ['ok' => false, 'error' => 'not_payable', 'detail' => 'Only an unpaid online order has a pay link.'];
    if ((string)$o['remindedAt'] !== '' && strtotime((string)$o['remindedAt']) > time() - 3600) return ['ok' => false, 'error' => 'too_soon', 'detail' => 'The buyer was reminded less than an hour ago.'];
    db_update('shop_orders', ['remindedAt' => now_iso(), 'updatedAt' => now_iso()], ['orderId' => (string)$o['orderId']]);
    shop_mail_buyer($o, 'remind');
    shop_event((string)$o['orderId'], 'remind', 'The pay link was sent again.', (string)$g['requester']['memberId']);
    audit('admin.shop.order.remind', $g['requester']['memberId'], (string)$o['orderId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── One order: the detail, notes, exchanges ──────────────────────────────── */

function admin_shop_order_get(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $o = shop_order_by('orderId', (string)($p['orderId'] ?? '')); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    $names = shop_product_names();
    $opts = [];
    foreach (shop_lines($o) as $l) { $pr = shop_product((string)$l['productId']); $opts[] = $pr ? array_values(array_filter(shop_options($pr), static fn($x) => $x !== '')) : []; }
    return ['ok' => true, 'order' => shop_order_admin($o),
        'events' => array_map(static fn($e) => ['kind' => (string)$e['kind'], 'text' => (string)$e['text'], 'by' => (string)$e['byId'], 'byName' => shop_person_name((string)$e['byId']), 'at' => (string)$e['createdAt']],
            db_all('SELECT * FROM shop_order_events WHERE orderId = ? ORDER BY id', [(string)$o['orderId']])),
        'refunds' => array_map(static fn($r) => ['refundId' => (string)$r['refundId'], 'amount' => (int)$r['amount'], 'method' => (string)$r['method'], 'status' => (string)$r['status'],
            'reason' => (string)$r['reason'], 'by' => shop_person_name((string)$r['byId']), 'createdAt' => (string)$r['createdAt'], 'processedAt' => (string)$r['processedAt']],
            db_all('SELECT * FROM shop_refunds WHERE orderId = ? ORDER BY id', [(string)$o['orderId']])),
        'moves' => array_map(static fn($m) => shop_move_public($m, $names), db_all('SELECT * FROM shop_stock_moves WHERE orderId = ? ORDER BY id', [(string)$o['orderId']])),
        'refundTerms' => (string)$o['paidAt'] !== '' ? shop_refund_terms($o) : null, 'lineOptions' => $opts,
        'oldNote' => (string)$o['note']];
}
function admin_shop_order_note(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $o = shop_order_by('orderId', (string)($p['orderId'] ?? '')); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    $t = trim(mb_substr((string)($p['text'] ?? ''), 0, 1000));
    if (mb_strlen($t) < 2) return ['ok' => false, 'error' => 'empty'];
    shop_event((string)$o['orderId'], 'note', $t, (string)$g['requester']['memberId']);
    audit('admin.shop.order.note', $g['requester']['memberId'], (string)$o['orderId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
/**
 * admin.shop.order.exchange — the wrong size: some of one line come back to the shelf and the same number of
 * another option of the same product go out, at the price charged. No money moves.
 */
function admin_shop_order_exchange(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $o = shop_order_by('orderId', (string)($p['orderId'] ?? '')); if (!$o) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    if (!in_array((string)$o['status'], ['paid', 'ready', 'completed'], true)) return ['ok' => false, 'error' => 'bad_step', 'detail' => 'Only a paid order can exchange an item.'];
    $lines = shop_lines($o); $i = (int)($p['line'] ?? -1); $l = $lines[$i] ?? null;
    if (!$l) return ['ok' => false, 'error' => 'bad_line'];
    $pr = shop_product((string)$l['productId']); if (!$pr) return ['ok' => false, 'error' => 'not_found'];
    $to = (string)($p['to'] ?? ''); $qty = (int)($p['qty'] ?? $l['qty']);
    if ($to === (string)$l['option'] || !in_array($to, shop_options($pr), true)) return ['ok' => false, 'error' => 'bad_option', 'detail' => 'Choose a different size of the same item.'];
    $back = shop_returned_by_line($o)[$i] ?? 0;
    if ($qty < 1 || $qty > (int)$l['qty'] - $back) return ['ok' => false, 'error' => 'bad_qty'];
    $by = (string)$g['requester']['memberId']; $oid = (string)$o['orderId'];
    $st = shop_stock($pr);
    $warn = $st !== null && ($st[$to] ?? 0) < $qty ? 'Only ' . (int)($st[$to] ?? 0) . ' of ' . $to . ' were recorded; the count is now below nought. Recount it.' : '';
    // The lines as charged: split the line, keeping its price.
    $new = $l; $new['option'] = $to; $new['qty'] = $qty; $new['amount'] = (int)$l['price'] * $qty;
    if ($qty === (int)$l['qty']) $lines[$i] = $new;
    else { $lines[$i]['qty'] = (int)$l['qty'] - $qty; $lines[$i]['amount'] = (int)$l['price'] * $lines[$i]['qty']; $lines[] = $new; }
    $won = db_exec('UPDATE shop_orders SET items = ?, updatedAt = ? WHERE orderId = ? AND items = ?', [json_encode($lines, JSON_UNESCAPED_UNICODE), now_iso(), $oid, (string)$o['items']]);
    if (!$won) return ['ok' => false, 'error' => 'changed'];
    shop_stock_move((string)$l['productId'], (string)$l['option'], $qty, 'exchange', 'Exchanged for ' . $to, $oid, $by);
    shop_stock_move((string)$l['productId'], $to, -$qty, 'exchange', 'Exchanged from ' . $l['option'], $oid, $by);
    shop_event($oid, 'exchange', 'Exchanged ' . $qty . ' × ' . $l['name'] . ' from ' . $l['option'] . ' to ' . $to . '.', $by);
    audit('admin.shop.order.exchange', $by, $oid, ['line' => $i, 'from' => (string)$l['option'], 'to' => $to, 'qty' => $qty], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'warning' => $warn, 'order' => shop_order_admin(shop_order_by('orderId', $oid))];
}

/* ── Sales at a table, and cash sessions (fees) ───────────────────────────── */

function shop_session_row(array $s): array {
    $sid = (string)$s['sessionId'];
    $by = ['cash' => 0, 'transfer' => 0, 'pos' => 0]; $n = 0;
    foreach (db_all("SELECT payMethod, COUNT(*) c, COALESCE(SUM(total), 0) t FROM shop_orders WHERE sessionId = ? AND channel = 'pos' AND status <> 'cancelled' GROUP BY payMethod", [$sid]) as $r) {
        $by[(string)$r['payMethod']] = (int)$r['t']; $n += (int)$r['c'];
    }
    // Cash paid back at the table comes out of the drawer.
    $cashBack = (int)(db_row("SELECT COALESCE(SUM(r.amount), 0) s FROM shop_refunds r JOIN shop_orders o ON o.orderId = r.orderId
        WHERE o.sessionId = ? AND o.payMethod = 'cash' AND r.method = 'outside' AND r.status = 'processed'", [$sid])['s'] ?? 0);
    $expected = (int)$s['openingFloat'] + $by['cash'] - $cashBack;
    return ['sessionId' => $sid, 'label' => (string)$s['label'], 'centre' => (string)$s['centre'], 'openingFloat' => (int)$s['openingFloat'], 'status' => (string)$s['status'],
        'openedBy' => shop_person_name((string)$s['openedBy']), 'openedAt' => (string)$s['openedAt'], 'closedBy' => shop_person_name((string)$s['closedBy']), 'closedAt' => (string)$s['closedAt'],
        'sales' => $n, 'byMethod' => $by, 'cashBack' => $cashBack, 'expected' => (string)$s['status'] === 'closed' ? (int)$s['expected'] : $expected,
        'counted' => (int)$s['counted'], 'difference' => (int)$s['difference'], 'note' => (string)$s['note']];
}
function shop_session_in_scope(array $g, array $s): bool {
    $scope = admin_centre_names_in_scope($g['requester']);
    return $scope === null || ((string)$s['centre'] !== '' && in_array(mb_strtolower((string)$s['centre']), array_map('mb_strtolower', $scope), true));
}
/** admin.shop.pos — what the quick-sale screen needs: the products (on sale or draft), the open sessions, the centres. */
function admin_shop_pos(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $prods = array_map(static fn($r) => ['productId' => (string)$r['productId'], 'name' => (string)$r['name'], 'price' => (int)$r['price'], 'status' => (string)$r['status'],
        'options' => array_values(array_filter(shop_options($r), static fn($x) => $x !== '')), 'onHand' => shop_stock_raw($r), 'imageUrl' => (string)$r['imageUrl']],
        db_all("SELECT * FROM shop_products WHERE status IN ('live','draft') AND price > 0 ORDER BY sort, name LIMIT 300"));
    $sessions = array_values(array_filter(db_all("SELECT * FROM shop_cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 50"), static fn($s) => shop_session_in_scope($g, $s)));
    $scope = admin_centre_names_in_scope($g['requester']);
    $centres = array_values(array_filter(shop_collection_centres(), static fn($c) => $scope === null || in_array(mb_strtolower($c), array_map('mb_strtolower', $scope), true)));
    return ['ok' => true, 'products' => $prods, 'sessions' => array_map('shop_session_row', $sessions), 'methods' => SHOP_PAY_METHODS, 'centres' => $centres,
        'scoped' => $scope !== null, 'bounds' => ['qtyMax' => SHOP_POS_QTY_MAX, 'linesMax' => SHOP_MAX_LINES, 'floatMax' => SHOP_FLOAT_MAX]];
}
/**
 * admin.shop.pos.sale — a sale at a table: priced from the catalogue, paid there and then, handed over at once. Cash
 * goes into an open session's drawer, so cash needs one. Never refused for stock: past the recorded count it goes
 * through, below nought, with a warning to recount.
 */
function admin_shop_pos_sale(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $method = (string)($p['method'] ?? '');
    if (!in_array($method, SHOP_PAY_METHODS, true)) return ['ok' => false, 'error' => 'bad_method', 'detail' => 'Say how it was paid: cash, transfer or POS terminal.'];
    $sid = trim((string)($p['sessionId'] ?? '')); $sess = null;
    if ($sid !== '') {
        $sess = db_row('SELECT * FROM shop_cash_sessions WHERE sessionId = ? LIMIT 1', [$sid]);
        if (!$sess || (string)$sess['status'] !== 'open') return ['ok' => false, 'error' => 'session_closed', 'detail' => 'That session is closed. Open a new one.'];
        if (!shop_session_in_scope($g, $sess)) return ['ok' => false, 'error' => 'out_of_scope'];
    }
    if ($method === 'cash' && !$sess) return ['ok' => false, 'error' => 'session_required', 'detail' => 'Cash goes in a drawer: open a cash session first.'];
    if (!$sess && admin_centre_names_in_scope($g['requester']) !== null) return ['ok' => false, 'error' => 'session_required', 'detail' => 'Sell inside a session at your centre.'];
    $items = is_array($p['items'] ?? null) ? $p['items'] : [];
    if (!$items) return ['ok' => false, 'error' => 'empty_cart'];
    if (count($items) > SHOP_MAX_LINES) return ['ok' => false, 'error' => 'too_many_lines'];
    $lines = []; $sub = 0;
    foreach ($items as $it) {
        $pr = shop_product((string)($it['productId'] ?? ''));
        if (!$pr || !in_array((string)$pr['status'], ['live', 'draft'], true) || (int)$pr['price'] <= 0) return ['ok' => false, 'error' => 'not_available', 'detail' => ($pr ? $pr['name'] : 'An item') . ' cannot be sold.'];
        $opt = trim((string)($it['variant'] ?? ($it['option'] ?? ''))); $qty = (int)($it['qty'] ?? 0);
        if (!in_array($opt, shop_options($pr), true)) return ['ok' => false, 'error' => 'bad_option', 'detail' => 'Choose a size for ' . $pr['name'] . '.'];
        if ($qty < 1 || $qty > SHOP_POS_QTY_MAX) return ['ok' => false, 'error' => 'bad_qty', 'detail' => 'Between 1 and ' . SHOP_POS_QTY_MAX . ' of each item.'];
        $amt = (int)$pr['price'] * $qty; $sub += $amt;
        $lines[] = ['productId' => (string)$pr['productId'], 'name' => (string)$pr['name'], 'option' => $opt, 'qty' => $qty, 'price' => (int)$pr['price'], 'amount' => $amt];
    }
    $name = trim(preg_replace('/\s+/', ' ', mb_substr((string)($p['buyerName'] ?? ''), 0, 120))) ?: 'Walk-in buyer';
    $phone = preg_replace('/[^0-9+]/', '', (string)($p['phone'] ?? ''));
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    $by = (string)$g['requester']['memberId'];
    $oid = 'POS-' . gmdate('ymd') . '-' . strtoupper(rand_hex(3));
    $centre = $sess ? (string)$sess['centre'] : '';
    db_insert('shop_orders', ['orderId' => $oid, 'token' => rand_hex(16), 'buyerName' => $name, 'email' => $email, 'phone' => mb_substr($phone, 0, 16),
        'items' => json_encode($lines, JSON_UNESCAPED_UNICODE), 'subtotal' => $sub, 'delivery' => 0, 'total' => $sub, 'processingFee' => 0, 'currency' => 'NGN',
        'fulfil' => 'collect', 'centre' => $centre, 'centreId' => $centre !== '' ? centre_id_for_name($centre) : '', 'address' => '', 'status' => 'completed',
        'channel' => 'pos', 'payMethod' => $method, 'sessionId' => $sess ? (string)$sess['sessionId'] : '', 'paystackRef' => '', 'note' => '',
        'paidAt' => now_iso(), 'completedAt' => now_iso(), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    $o = shop_order_by('orderId', $oid);
    $short = shop_stock_take($o, -1, $by);
    $label = ['cash' => 'cash', 'transfer' => 'bank transfer', 'pos' => 'POS terminal'][$method];
    shop_event($oid, 'pos', 'Sold at the table' . ($sess ? ' (' . $sess['label'] . ')' : '') . ', paid by ' . $label . ': ₦' . number_format($sub) . '.' . (trim((string)($p['note'] ?? '')) !== '' ? ' ' . mb_substr(trim((string)$p['note']), 0, 200) : ''), $by);
    if ($short) shop_event($oid, 'short', 'Sold past the recorded stock: ' . implode(', ', $short) . '. Recount.', $by);
    audit('admin.shop.pos.sale', $by, $oid, ['total' => $sub, 'method' => $method, 'session' => $sess ? (string)$sess['sessionId'] : '', 'short' => $short], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'orderId' => $oid, 'total' => $sub, 'warnings' => $short, 'session' => $sess ? shop_session_row(db_row('SELECT * FROM shop_cash_sessions WHERE sessionId = ?', [(string)$sess['sessionId']])) : null];
}
function admin_shop_pos_session_open(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $label = trim(preg_replace('/\s+/', ' ', mb_substr((string)($p['label'] ?? ''), 0, 80)));
    if (mb_strlen($label) < 2) return ['ok' => false, 'error' => 'bad_label', 'detail' => 'Name the table or day, e.g. “Open day, Egbeda”.'];
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '') { $hit = null; foreach (shop_collection_centres() as $c) if (mb_strtolower($c) === mb_strtolower($centre)) $hit = $c; if ($hit === null) return ['ok' => false, 'error' => 'bad_centre']; $centre = $hit; }
    $sess = ['centre' => $centre];
    if (!shop_session_in_scope($g, $sess)) return ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'Open the session at one of your centres.'];
    $float = (int)($p['openingFloat'] ?? 0);
    if ($float < 0 || $float > SHOP_FLOAT_MAX) return ['ok' => false, 'error' => 'bad_float'];
    $sid = 'CSH-' . gmdate('ymd') . '-' . strtoupper(rand_hex(3));
    db_insert('shop_cash_sessions', ['sessionId' => $sid, 'label' => $label, 'centre' => $centre, 'centreId' => $centre !== '' ? centre_id_for_name($centre) : '', 'openingFloat' => $float, 'status' => 'open',
        'openedBy' => (string)$g['requester']['memberId'], 'openedAt' => now_iso()]);
    audit('admin.shop.pos.session.open', $g['requester']['memberId'], $sid, ['label' => $label, 'centre' => $centre, 'float' => $float], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'session' => shop_session_row(db_row('SELECT * FROM shop_cash_sessions WHERE sessionId = ?', [$sid]))];
}
/** Close a session: the cash counted against what should be in the drawer; the difference is kept, never adjusted away. */
function admin_shop_pos_session_close(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $s = db_row('SELECT * FROM shop_cash_sessions WHERE sessionId = ? LIMIT 1', [(string)($p['sessionId'] ?? '')]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_session_in_scope($g, $s)) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$s['status'] !== 'open') return ['ok' => true, 'unchanged' => true, 'session' => shop_session_row($s)];
    if (!array_key_exists('counted', $p) || !is_numeric($p['counted']) || (int)$p['counted'] < 0 || (int)$p['counted'] > SHOP_FLOAT_MAX * 20) return ['ok' => false, 'error' => 'bad_count', 'detail' => 'Enter the cash counted in the drawer.'];
    $row = shop_session_row($s); $counted = (int)$p['counted']; $diff = $counted - $row['expected'];
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 300));
    if ($diff !== 0 && mb_strlen($note) < 3) return ['ok' => false, 'error' => 'note_required', 'detail' => 'The drawer is ₦' . number_format(abs($diff)) . ($diff < 0 ? ' short' : ' over') . '. Say why.'];
    $won = db_exec("UPDATE shop_cash_sessions SET status = 'closed', closedBy = ?, closedAt = ?, expected = ?, counted = ?, difference = ?, note = ? WHERE sessionId = ? AND status = 'open'",
        [(string)$g['requester']['memberId'], now_iso(), $row['expected'], $counted, $diff, $note, (string)$s['sessionId']]);
    if (!$won) return ['ok' => false, 'error' => 'changed'];
    audit('admin.shop.pos.session.close', $g['requester']['memberId'], (string)$s['sessionId'], ['expected' => $row['expected'], 'counted' => $counted, 'difference' => $diff], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'session' => shop_session_row(db_row('SELECT * FROM shop_cash_sessions WHERE sessionId = ?', [(string)$s['sessionId']]))];
}
function admin_shop_pos_sessions(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $rows = array_values(array_filter(db_all('SELECT * FROM shop_cash_sessions ORDER BY id DESC LIMIT 100'), static fn($s) => shop_session_in_scope($g, $s)));
    $sid = (string)($p['sessionId'] ?? '');
    $sales = [];
    if ($sid !== '') {
        $s = db_row('SELECT * FROM shop_cash_sessions WHERE sessionId = ?', [$sid]);
        if (!$s || !shop_session_in_scope($g, $s)) return ['ok' => false, 'error' => 'not_found'];
        $sales = array_map('shop_order_admin', db_all("SELECT * FROM shop_orders WHERE sessionId = ? ORDER BY id DESC LIMIT 500", [$sid]));
    }
    return ['ok' => true, 'sessions' => array_map('shop_session_row', array_slice($rows, 0, 50)), 'sales' => $sales];
}

/* ── Reports (fees) ───────────────────────────────────────────────────────── */

/** A Lagos day's first instant, as the ISO strings the tables keep. */
function shop_lagos_day_start(string $ymd): string { return gmdate('Y-m-d\TH:i:s\Z', strtotime($ymd . ' 00:00:00 UTC') - 3600); }
/**
 * admin.shop.report — the "today" numbers, then a date range (Lagos days, by when it was paid): gross, the Paystack
 * charge buyers bore, what Paystack kept as it reported it, refunds, net; sales by product and size; by channel and
 * how it was paid; by day; stock value and sell-through. Scoped like the orders.
 */
function admin_shop_report(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $today = gmdate('Y-m-d', time() + 3600);
    $to = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['to'] ?? '')) ? (string)$p['to'] : $today;
    $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['from'] ?? '')) ? (string)$p['from'] : gmdate('Y-m-d', strtotime($to . ' UTC') - 29 * 86400);
    if ($from > $to) [$from, $to] = [$to, $from];
    if ((strtotime($to . ' UTC') - strtotime($from . ' UTC')) / 86400 > SHOP_REPORT_DAYS_MAX) return ['ok' => false, 'error' => 'range_too_long', 'detail' => 'At most ' . SHOP_REPORT_DAYS_MAX . ' days.'];
    $sc = shop_scope_sql($g);
    if ($sc === null) $sc = ["1 = 0", []];
    $sw = $sc[0] !== '' ? ' AND ' . $sc[0] : '';
    $pid = (string)($p['productId'] ?? '');
    $a = shop_lagos_day_start($from); $b = shop_lagos_day_start(gmdate('Y-m-d', strtotime($to . ' UTC') + 86400));
    $rows = db_all("SELECT * FROM shop_orders WHERE paidAt <> '' AND paidAt >= ? AND paidAt < ?" . $sw . ' ORDER BY id LIMIT ' . SHOP_EXPORT_MAX, array_merge([$a, $b], $sc[1]));
    $sum = ['orders' => 0, 'goods' => 0, 'discounts' => 0, 'delivery' => 0, 'gross' => 0, 'buyerCharges' => 0, 'gatewayFees' => 0, 'refunds' => 0, 'net' => 0, 'feesUnreported' => 0, 'items' => 0];
    $byProduct = []; $byChannel = []; $byMethod = []; $byDay = [];
    foreach ($rows as $o) {
        $lines = shop_lines($o);
        if ($pid !== '' && !array_filter($lines, static fn($l) => (string)$l['productId'] === $pid)) continue;
        $sum['orders']++;
        $sum['goods'] += (int)$o['subtotal'] - (int)$o['discount']; $sum['discounts'] += (int)$o['discount']; $sum['delivery'] += (int)$o['delivery'];
        $sum['gross'] += (int)$o['total']; $sum['buyerCharges'] += (string)$o['channel'] === 'online' ? (int)$o['processingFee'] : 0; $sum['gatewayFees'] += (int)$o['gatewayFee'];
        if ((string)$o['channel'] === 'online' && (int)$o['gatewayFee'] === 0) $sum['feesUnreported']++;
        $ch = (string)$o['channel']; $byChannel[$ch] = ($byChannel[$ch] ?? 0) + (int)$o['total'];
        $pm = (string)$o['payMethod']; $byMethod[$pm] = ($byMethod[$pm] ?? 0) + (int)$o['total'];
        $day = gmdate('Y-m-d', strtotime((string)$o['paidAt']) + 3600); $byDay[$day] = ($byDay[$day] ?? 0) + (int)$o['total'];
        foreach ($lines as $l) {
            if ($pid !== '' && (string)$l['productId'] !== $pid) continue;
            $k = $l['productId'] . "\x1f" . $l['option'];
            $byProduct[$k] ??= ['productId' => (string)$l['productId'], 'name' => (string)$l['name'], 'variant' => (string)$l['option'], 'qty' => 0, 'amount' => 0];
            $byProduct[$k]['qty'] += (int)$l['qty']; $byProduct[$k]['amount'] += (int)$l['amount']; $sum['items'] += (int)$l['qty'];
        }
    }
    $sum['refunds'] = (int)(db_row("SELECT COALESCE(SUM(r.amount), 0) s FROM shop_refunds r JOIN shop_orders o ON o.orderId = r.orderId WHERE r.status = 'processed' AND r.processedAt >= ? AND r.processedAt < ?"
        . ($sc[0] !== '' ? ' AND ' . str_replace(['fulfil', 'centre IN'], ['o.fulfil', 'o.centre IN'], $sc[0]) : ''), array_merge([$a, $b], $sc[1]))['s'] ?? 0);
    $sum['net'] = $sum['gross'] + $sum['buyerCharges'] - $sum['gatewayFees'] - $sum['refunds'];
    usort($byProduct, static fn($x, $y) => [$y['qty'], $y['amount']] <=> [$x['qty'], $x['amount']]);
    ksort($byDay);
    // Stock value and sell-through per product: sold in the range against sold plus what is left.
    $variants = shop_variant_rows(); $left = [];
    foreach ($variants as $v) $left[$v['productId']] = ($left[$v['productId']] ?? 0) + max(0, $v['onHand']);
    $sold = []; foreach ($byProduct as $r) $sold[$r['productId']] = ['name' => $r['name'], 'qty' => ($sold[$r['productId']]['qty'] ?? 0) + $r['qty']];
    $through = [];
    foreach ($sold as $id => $r) if (isset($left[$id])) $through[] = ['productId' => $id, 'name' => $r['name'], 'sold' => $r['qty'], 'left' => $left[$id], 'pct' => (int)round(100 * $r['qty'] / max(1, $r['qty'] + $left[$id]))];
    $value = 0; foreach ($variants as $v) $value += max(0, $v['onHand']) * $v['price'];
    return ['ok' => true, 'from' => $from, 'to' => $to, 'productId' => $pid, 'today' => shop_today($sc), 'summary' => $sum, 'byProduct' => array_values($byProduct),
        'byChannel' => $byChannel, 'byMethod' => $byMethod, 'byDay' => $byDay, 'sellThrough' => $through, 'stockValue' => $value,
        'truncated' => count($rows) >= SHOP_EXPORT_MAX, 'max' => SHOP_EXPORT_MAX, 'daysMax' => SHOP_REPORT_DAYS_MAX];
}
/** The four numbers that drive the day (plan §1, Reporting). */
function shop_today(array $sc): array {
    $sw = $sc[0] !== '' ? ' AND ' . $sc[0] : '';
    $cnt = static fn(string $w) => (int)(db_row('SELECT COUNT(*) c FROM shop_orders WHERE ' . $w . $sw, $sc[1])['c'] ?? 0);
    $net = static function (string $since) use ($sw, $sc) {
        $r = db_row("SELECT COALESCE(SUM(total), 0) t, COALESCE(SUM(CASE WHEN channel = 'online' THEN processingFee ELSE 0 END), 0) f, COALESCE(SUM(gatewayFee), 0) g, COUNT(*) c FROM shop_orders WHERE paidAt <> '' AND paidAt >= ?" . $sw, array_merge([$since], $sc[1]));
        return ['orders' => (int)$r['c'], 'gross' => (int)$r['t'], 'net' => (int)$r['t'] + (int)$r['f'] - (int)$r['g']];
    };
    $today = gmdate('Y-m-d', time() + 3600);
    $v = shop_variant_rows(true);
    return ['toPrepare' => $cnt("status = 'paid'"), 'ready' => $cnt("status = 'ready'"), 'unpaid' => $cnt("status = 'pending'"), 'refundsDue' => $cnt("refundState = 'due'"),
        'low' => count(array_filter($v, static fn($r) => $r['state'] === 'low')), 'out' => count(array_filter($v, static fn($r) => $r['state'] === 'out' && !$r['preorder'])),
        'salesToday' => $net(shop_lagos_day_start($today)), 'salesWeek' => $net(shop_lagos_day_start(gmdate('Y-m-d', strtotime($today . ' UTC') - 6 * 86400)))];
}
/** admin.shop.orders.export — the orders in a range (by when ordered) as rows for a CSV; capped, and says so. */
function admin_shop_orders_export(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    [$where, $args] = shop_orders_where($p);
    $sc = shop_scope_sql($g); if ($sc === null) return ['ok' => true, 'rows' => [], 'truncated' => false];
    if ($sc[0] !== '') { $where[] = $sc[0]; $args = array_merge($args, $sc[1]); }
    $rows = db_all('SELECT * FROM shop_orders' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id LIMIT ' . (SHOP_EXPORT_MAX + 1), $args);
    $trunc = count($rows) > SHOP_EXPORT_MAX; $rows = array_slice($rows, 0, SHOP_EXPORT_MAX);
    audit('admin.shop.orders.export', $g['requester']['memberId'], 'shop', ['rows' => count($rows)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'truncated' => $trunc, 'max' => SHOP_EXPORT_MAX, 'rows' => array_map(static fn($o) => [
        'orderId' => (string)$o['orderId'], 'createdAt' => (string)$o['createdAt'], 'paidAt' => (string)$o['paidAt'], 'status' => (string)$o['status'],
        'channel' => (string)$o['channel'], 'payMethod' => (string)$o['payMethod'], 'buyerName' => (string)$o['buyerName'], 'email' => (string)$o['email'], 'phone' => (string)$o['phone'],
        'fulfil' => (string)$o['fulfil'], 'centre' => (string)$o['centre'],
        'items' => implode('; ', array_map(static fn($l) => $l['qty'] . ' × ' . $l['name'] . ((string)$l['option'] !== '' ? ' (' . $l['option'] . ')' : ''), shop_lines($o))),
        'subtotal' => (int)$o['subtotal'], 'discountCode' => (string)$o['discountCode'], 'discount' => (int)$o['discount'], 'delivery' => (int)$o['delivery'], 'total' => (int)$o['total'],
        'buyerCharge' => (int)$o['processingFee'], 'paystackFee' => (int)$o['gatewayFee'], 'refunded' => (int)$o['refunded'], 'reference' => (string)$o['paystackRef'], 'sessionId' => (string)$o['sessionId'],
    ], $rows)];
}

/* ── The hourly job (webcron.php) ─────────────────────────────────────────── */

/** Expire unpaid orders, send the one reminder, ask Paystack about refunds it has not reported, and the daily digest. */
function shop_cron_tick(): void {
    shop_expire_pending();
    shop_remind_unpaid();
    $old = gmdate('Y-m-d\TH:i:s\Z', time() - 1800);
    foreach (db_all("SELECT * FROM shop_refunds WHERE method = 'paystack' AND status IN ('pending','processing') AND gatewayId <> '' AND updatedAt < ? ORDER BY id LIMIT 10", [$old]) as $r) {
        db_update('shop_refunds', ['updatedAt' => now_iso()], ['refundId' => (string)$r['refundId']]);   // asked; next time it waits its turn again
        shop_refund_poll($r);
    }
    shop_lowstock_digest();
}
