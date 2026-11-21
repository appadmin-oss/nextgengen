<?php
/**
 * The NGG shop — souvenirs and merchandise (owner, 17 Nov 2026: "Create a shop for NGG … for souvenirs
 * and mercs"). T-shirts in sizes, caps, mugs, notebooks: a catalogue staff keep, a public page anybody can
 * buy from, Paystack checkout, and a desk that hands the goods over.
 *
 * The rules, each for a reason:
 *  - The server prices everything. A cart is a list of product ids, options and quantities; prices, the
 *    delivery fee and Paystack's charge are read here, never from the browser.
 *  - The buyer bears Paystack's charge (owner, Nov 2026: "The parents should pay the paystack charges"),
 *    computed by the same function as membership (paystack_family_charge) and said before Pay is pressed.
 *  - Paid is decided by Paystack's own answer — success, our reference, the exact amount and currency,
 *    tagged with THIS order — never by the browser coming back. Money that arrives for an order that is no
 *    longer pending is put on the record (unapplied_payments) for a person, never dropped.
 *  - Stock is a limit, not a hope: a line beyond what is left is refused at the quote and again at the
 *    order; it is taken off when the order is PAID (an abandoned checkout holds nothing back).
 *  - Collection is at a centre that is a building — never NGG Online (centres.online).
 *  - Two trusts: the catalogue is `content` (what NGG shows); orders, refunds and settings are `fees`
 *    (money). A centre-scoped fees holder sees the orders for collection at their centres.
 */

const SHOP_CATEGORIES = ['Clothing', 'Souvenirs', 'Stationery', 'Accessories', 'Other'];
const SHOP_PRODUCT_STATUSES = ['draft', 'live', 'retired'];
const SHOP_ORDER_STATUSES = ['pending', 'paid', 'ready', 'completed', 'cancelled'];
const SHOP_MAX_LINES = 20;
const SHOP_MAX_QTY = 20;
const SHOP_PRICE_MAX = 5000000;
const SHOP_OPTIONS_MAX = 12;
const SHOP_LIST_MAX = 300;
const SHOP_STOCK_MAX = 100000;
const SHOP_DELIVERY_FEE_MAX = 100000;
const SHOP_DEFAULTS = ['enabled' => false, 'deliveryOn' => false, 'deliveryFee' => 2500,
    'collectNote' => 'Collect it at your centre’s desk on a programme day. Bring the order number.',
    'deliveryNote' => 'Delivered within Lagos in 3–5 working days.'];

function shop_settings(): array {
    $s = setting_get('shop'); $s = is_array($s) ? $s : [];
    $out = SHOP_DEFAULTS;
    foreach (SHOP_DEFAULTS as $k => $d) if (array_key_exists($k, $s)) $out[$k] = is_bool($d) ? !empty($s[$k]) : (is_int($d) ? (int)$s[$k] : (string)$s[$k]);
    return $out;
}

/* ── The catalogue ───────────────────────────────────────────────────────── */

/** The options a buyer chooses from ('' when a product has none, e.g. a mug). */
function shop_options(array $p): array { $o = json_decode((string)($p['options'] ?? ''), true); return is_array($o) && $o ? array_values(array_map('strval', $o)) : ['']; }
/** What is left per option; null = no limit. */
function shop_stock(array $p): ?array {
    $raw = (string)($p['stock'] ?? '');
    if ($raw === '') return null;
    $s = json_decode($raw, true); if (!is_array($s)) return null;
    $out = []; foreach (shop_options($p) as $o) $out[$o] = max(0, (int)($s[$o] ?? 0));
    return $out;
}
function shop_product_public(array $p): array {
    $stock = shop_stock($p); $opts = shop_options($p);
    return ['productId' => (string)$p['productId'], 'slug' => (string)$p['slug'], 'name' => (string)$p['name'], 'category' => (string)$p['category'],
        'description' => (string)$p['description'], 'price' => (int)$p['price'], 'imageUrl' => (string)$p['imageUrl'],
        'options' => $opts === [''] ? [] : $opts, 'left' => $stock,
        'soldOut' => $stock !== null && array_sum($stock) <= 0];
}
function shop_product(string $id): ?array { return db_row('SELECT * FROM shop_products WHERE productId = ? LIMIT 1', [$id]) ?: null; }

/** public.shop.list — the live catalogue and what checkout offers. An empty, closed shop says so. */
function public_shop_list(array $p): array {
    $s = shop_settings();
    if (!$s['enabled']) return ['ok' => true, 'open' => false, 'products' => []];
    $rows = db_all("SELECT * FROM shop_products WHERE status = 'live' ORDER BY sort, name LIMIT 200");
    return ['ok' => true, 'open' => true, 'products' => array_map('shop_product_public', $rows), 'checkout' => shop_checkout_terms($s)];
}
function shop_checkout_terms(array $s): array {
    return ['currency' => 'NGN', 'symbol' => '₦', 'paystack' => paystack_secret() !== '',
        'deliveryOn' => $s['deliveryOn'], 'deliveryFee' => $s['deliveryOn'] ? max(0, $s['deliveryFee']) : 0,
        'collectNote' => $s['collectNote'], 'deliveryNote' => $s['deliveryNote'], 'centres' => shop_collection_centres(),
        // The cart's limits, so the page offers no more than the quote will take.
        'maxLines' => SHOP_MAX_LINES, 'maxQty' => SHOP_MAX_QTY];
}
/** Where an order can be collected: the NGG centres that are buildings. */
function shop_collection_centres(): array {
    $out = [];
    foreach (centres_for_programme('ngg', 'name') as $c) if (!centre_is_online((string)$c['name'])) $out[] = (string)$c['name'];
    return $out;
}

/**
 * Price a cart, from the catalogue, now. Returns the lines as charged, or the first problem by name:
 * a product gone or not live, an option that is not offered, a quantity out of range, more than is left.
 */
function shop_quote(array $items, string $fulfil): array {
    $s = shop_settings();
    if (!$s['enabled']) return ['ok' => false, 'error' => 'shop_closed'];
    if (!$items) return ['ok' => false, 'error' => 'empty_cart'];
    if (count($items) > SHOP_MAX_LINES) return ['ok' => false, 'error' => 'too_many_lines', 'detail' => 'At most ' . SHOP_MAX_LINES . ' lines in one order.'];
    if (!in_array($fulfil, ['collect', 'deliver'], true)) return ['ok' => false, 'error' => 'bad_fulfil'];
    if ($fulfil === 'deliver' && !$s['deliveryOn']) return ['ok' => false, 'error' => 'no_delivery'];
    $lines = []; $want = []; $sub = 0;
    foreach ($items as $it) {
        $id = (string)($it['productId'] ?? ''); $opt = trim((string)($it['option'] ?? '')); $qty = (int)($it['qty'] ?? 0);
        $p = $id !== '' ? shop_product($id) : null;
        if (!$p || (string)$p['status'] !== 'live') return ['ok' => false, 'error' => 'not_available', 'detail' => ($p ? $p['name'] : 'An item') . ' is no longer for sale.'];
        $opts = shop_options($p);
        if (!in_array($opt, $opts, true)) return ['ok' => false, 'error' => 'bad_option', 'detail' => 'Choose ' . ($opts === [''] ? 'no option' : 'one of ' . implode(', ', $opts)) . ' for ' . $p['name'] . '.'];
        if ($qty < 1 || $qty > SHOP_MAX_QTY) return ['ok' => false, 'error' => 'bad_qty', 'detail' => 'Between 1 and ' . SHOP_MAX_QTY . ' of each item.'];
        $k = $id . "\x1f" . $opt; $want[$k] = ($want[$k] ?? 0) + $qty;
        $stock = shop_stock($p);
        if ($stock !== null && $want[$k] > ($stock[$opt] ?? 0)) {
            $left = $stock[$opt] ?? 0;
            return ['ok' => false, 'error' => 'out_of_stock', 'detail' => $left > 0 ? 'Only ' . $left . ' left of ' . $p['name'] . ($opt !== '' ? ' (' . $opt . ')' : '') . '.' : $p['name'] . ($opt !== '' ? ' (' . $opt . ')' : '') . ' is sold out.'];
        }
        $amt = (int)$p['price'] * $qty; $sub += $amt;
        $lines[] = ['productId' => $id, 'name' => (string)$p['name'], 'option' => $opt, 'qty' => $qty, 'price' => (int)$p['price'], 'amount' => $amt];
    }
    $delivery = $fulfil === 'deliver' ? max(0, (int)$s['deliveryFee']) : 0;
    $total = $sub + $delivery;
    return ['ok' => true, 'lines' => $lines, 'subtotal' => $sub, 'delivery' => $delivery, 'total' => $total,
        'onlineFee' => paystack_secret() !== '' ? paystack_family_charge($total) : 0];
}
function public_shop_quote(array $p): array {
    $q = shop_quote(is_array($p['items'] ?? null) ? $p['items'] : [], (string)($p['fulfil'] ?? 'collect'));
    return $q;
}

/* ── Ordering and paying ─────────────────────────────────────────────────── */

function shop_origin(): string { return rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'); }
function shop_order_url(array $o): string { return shop_origin() . '/shop/order/' . rawurlencode((string)$o['token']); }
function shop_order_by(string $col, string $v): ?array {
    if (!in_array($col, ['orderId', 'token', 'paystackRef'], true) || $v === '') return null;
    return db_row("SELECT * FROM shop_orders WHERE $col = ? LIMIT 1", [$v]) ?: null;
}
function shop_lines(array $o): array { $l = json_decode((string)$o['items'], true); return is_array($l) ? $l : []; }

/** public.shop.order — validate, price, record the order, and open Paystack for it. */
function public_shop_order(array $p): array {
    if (paystack_secret() === '') return ['ok' => false, 'error' => 'payments_unavailable'];
    $b = is_array($p['buyer'] ?? null) ? $p['buyer'] : [];
    $name = trim(preg_replace('/\s+/', ' ', (string)($b['name'] ?? '')));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $phone = preg_replace('/[^0-9+]/', '', (string)($b['phone'] ?? ''));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) return ['ok' => false, 'error' => 'bad_name'];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 200) return ['ok' => false, 'error' => 'bad_email'];
    if (strlen($phone) < 7 || strlen($phone) > 16) return ['ok' => false, 'error' => 'bad_phone'];
    $fulfil = (string)($p['fulfil'] ?? 'collect');
    $centre = trim((string)($p['centre'] ?? '')); $address = trim(mb_substr((string)($p['address'] ?? ''), 0, 400));
    if ($fulfil === 'collect') {
        $hit = null; foreach (shop_collection_centres() as $c) if (mb_strtolower($c) === mb_strtolower($centre)) $hit = $c;
        if ($hit === null) return ['ok' => false, 'error' => 'bad_centre', 'detail' => 'Choose the centre where you will collect it.'];
        $centre = $hit; $address = '';
    } elseif ($fulfil === 'deliver') {
        if (mb_strlen($address) < 10) return ['ok' => false, 'error' => 'bad_address', 'detail' => 'Write the full delivery address.'];
        $centre = '';
    }
    $q = shop_quote(is_array($p['items'] ?? null) ? $p['items'] : [], $fulfil);
    if (empty($q['ok'])) return $q;
    $fee = paystack_family_charge((int)$q['total']);
    $orderId = 'SHP-' . gmdate('ymd') . '-' . strtoupper(rand_hex(3));
    $token = rand_hex(16); $ref = 'NGGS-' . strtoupper(rand_hex(8));
    db_insert('shop_orders', ['orderId' => $orderId, 'token' => $token, 'buyerName' => $name, 'email' => $email, 'phone' => $phone,
        'items' => json_encode($q['lines'], JSON_UNESCAPED_UNICODE), 'subtotal' => $q['subtotal'], 'delivery' => $q['delivery'], 'total' => $q['total'],
        'processingFee' => 0, 'currency' => 'NGN', 'fulfil' => $fulfil, 'centre' => $centre, 'centreId' => $centre !== '' ? centre_id_for_name($centre) : '', 'address' => $address, 'status' => 'pending',
        'paystackRef' => $ref, 'note' => '', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    $o = shop_order_by('orderId', $orderId);
    $r = paystack_http('POST', '/transaction/initialize', ['email' => $email, 'amount' => ((int)$q['total'] + $fee) * 100, 'currency' => 'NGN',
        'reference' => $ref, 'callback_url' => shop_order_url($o),
        'metadata' => ['orderId' => $orderId, 'kind' => 'ngg_shop', 'processingFee' => $fee]]);
    if (empty($r['status']) || empty($r['data']['authorization_url'])) {
        db_update('shop_orders', ['status' => 'cancelled', 'note' => 'Paystack did not open a checkout.', 'updatedAt' => now_iso()], ['orderId' => $orderId]);
        return ['ok' => false, 'error' => 'init_failed'];
    }
    audit('shop.order', null, $orderId, ['total' => $q['total'], 'fee' => $fee, 'lines' => count($q['lines']), 'fulfil' => $fulfil], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'authorizationUrl' => (string)$r['data']['authorization_url'], 'token' => $token, 'orderId' => $orderId, 'total' => (int)$q['total'], 'processingFee' => $fee];
}

/** Paid — from Paystack's own answer only (see the header). */
function shop_paystack_verify(string $reference): array {
    if (!preg_match('/^NGGS-[A-F0-9]{16}$/', $reference)) return ['ok' => false, 'error' => 'bad_reference'];
    $r = paystack_http('GET', '/transaction/verify/' . rawurlencode($reference));
    $d = is_array($r['data'] ?? null) ? $r['data'] : [];
    $oid = (string)($d['metadata']['orderId'] ?? '');
    $o = $oid !== '' ? shop_order_by('orderId', $oid) : shop_order_by('paystackRef', $reference);
    if (!$o) return ['ok' => false, 'error' => 'not_found'];
    $ok = !empty($r['status']) && ($d['status'] ?? '') === 'success';
    if (!$ok) return ['ok' => true, 'status' => (string)$o['status'], 'order' => $o, 'paystack' => (string)($d['status'] ?? '')];
    if ((string)$o['status'] !== 'pending') {
        $appliedHere = (string)$o['paystackRef'] === $reference && (string)$o['paidAt'] !== '';
        if (!$appliedHere && function_exists('unapplied_record'))
            unapplied_record($reference, 'unapplied', ['invoiceId' => (string)$o['orderId'], 'memberId' => ''], (int)round(((int)($d['amount'] ?? 0)) / 100), (string)($d['currency'] ?? 'NGN'));
        return ['ok' => true, 'status' => (string)$o['status'], 'order' => $o];
    }
    $fee = max(0, (int)($d['metadata']['processingFee'] ?? 0));
    // Short never pays; over pays only by what Paystack's "pass charges" could add (paystack_amount_ok).
    if ($fee > (int)$o['total'] || (string)($d['reference'] ?? '') !== $reference || !paystack_amount_ok((int)($d['amount'] ?? 0), ((int)$o['total'] + $fee) * 100)
        || strtoupper((string)($d['currency'] ?? '')) !== 'NGN' || ($oid !== '' && $oid !== (string)$o['orderId'])) {
        audit('shop.paystack.mismatch', null, (string)$o['orderId'], ['reference' => $reference, 'amount' => (int)($d['amount'] ?? 0)]);
        if (function_exists('unapplied_record')) unapplied_record($reference, 'mismatch', ['invoiceId' => (string)$o['orderId'], 'memberId' => ''], (int)round(((int)($d['amount'] ?? 0)) / 100), (string)($d['currency'] ?? 'NGN'));
        return ['ok' => false, 'error' => 'payment_mismatch'];
    }
    if ((int)$d['amount'] > ((int)$o['total'] + $fee) * 100) {
        audit('shop.paystack.overpaid', 'paystack', (string)$o['orderId'], ['reference' => $reference, 'asked' => ((int)$o['total'] + $fee) * 100, 'paid' => (int)$d['amount']]);
        $fee = intdiv((int)$d['amount'], 100) - (int)$o['total'];
    }
    // One writer wins: only a still-pending order becomes paid, so a webhook and the return page cannot both take stock off.
    $won = db_exec("UPDATE shop_orders SET status = 'paid', paidAt = ?, processingFee = ?, updatedAt = ? WHERE orderId = ? AND status = 'pending'",
        [now_iso(), $fee, now_iso(), (string)$o['orderId']]);
    $o = shop_order_by('orderId', (string)$o['orderId']);
    if ($won) {
        $short = shop_stock_take($o, -1);
        if ($short) db_update('shop_orders', ['note' => 'Paid while short of stock: ' . implode(', ', $short) . '. Restock or refund.'], ['orderId' => (string)$o['orderId']]);
        audit('shop.paid', 'paystack', (string)$o['orderId'], ['reference' => $reference, 'total' => (int)$o['total'], 'fee' => $fee, 'short' => $short]);
        shop_mail_buyer($o, 'paid');
        $o = shop_order_by('orderId', (string)$o['orderId']);
    }
    return ['ok' => true, 'status' => (string)$o['status'], 'order' => $o];
}

/**
 * Move stock by an order's lines: -1 takes it off (paid), +1 puts it back (a paid order cancelled).
 * Returns the lines that could not be fully taken (sold while the buyer was paying).
 */
function shop_stock_take(array $o, int $dir): array {
    $short = [];
    foreach (shop_lines($o) as $l) {
        $p = shop_product((string)$l['productId']); if (!$p) continue;
        $stock = shop_stock($p); if ($stock === null) continue;
        $opt = (string)$l['option']; $have = $stock[$opt] ?? 0; $qty = (int)$l['qty'];
        if ($dir < 0 && $have < $qty) $short[] = $l['name'] . ($opt !== '' ? ' (' . $opt . ')' : '') . ' ×' . ($qty - $have);
        $stock[$opt] = max(0, $have + $dir * $qty);
        db_update('shop_products', ['stock' => json_encode($stock, JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['productId' => (string)$p['productId']]);
    }
    return $short;
}

function shop_order_public(array $o): array {
    return ['orderId' => (string)$o['orderId'], 'status' => (string)$o['status'], 'buyerName' => (string)$o['buyerName'],
        'lines' => array_map(static fn($l) => ['name' => (string)$l['name'], 'option' => (string)$l['option'], 'qty' => (int)$l['qty'], 'price' => (int)$l['price'], 'amount' => (int)$l['amount']], shop_lines($o)),
        'subtotal' => (int)$o['subtotal'], 'delivery' => (int)$o['delivery'], 'total' => (int)$o['total'], 'processingFee' => (int)$o['processingFee'],
        'fulfil' => (string)$o['fulfil'], 'centre' => (string)$o['centre'], 'paidAt' => (string)$o['paidAt'], 'readyAt' => (string)($o['readyAt'] ?? ''),
        'completedAt' => (string)($o['completedAt'] ?? ''), 'symbol' => '₦', 'note' => shop_settings()[(string)$o['fulfil'] === 'deliver' ? 'deliveryNote' : 'collectNote']];
}
/** public.shop.order.get — the order by its private link; with a Paystack reference, confirm it first. */
function public_shop_order_get(array $p): array {
    $o = shop_order_by('token', trim((string)($p['token'] ?? '')));
    if (!$o) return ['ok' => false, 'error' => 'not_found'];
    $ref = trim((string)($p['reference'] ?? ''));
    if ($ref !== '' && (string)$o['status'] === 'pending') {
        $v = shop_paystack_verify($ref);
        if (empty($v['ok'])) return ['ok' => false, 'error' => $v['error'] ?? 'failed'];
        if ((string)($v['order']['orderId'] ?? '') !== (string)$o['orderId']) return ['ok' => false, 'error' => 'bad_reference'];
        $o = shop_order_by('token', (string)$o['token']);
        // Still pending after Paystack answered: say whether to wait or to give up (paystack_settle_word).
        if ((string)$o['status'] === 'pending')
            return ['ok' => true, 'order' => shop_order_public($o), 'paystackStatus' => paystack_settle_word((string)($v['paystack'] ?? ''))];
    }
    return ['ok' => true, 'order' => shop_order_public($o)];
}

function shop_mail_buyer(array $o, string $what): void {
    if (!function_exists('send_mail') || (string)$o['email'] === '') return;
    $first = explode(' ', trim((string)$o['buyerName']))[0] ?: 'there';
    $where = (string)$o['fulfil'] === 'deliver' ? 'It will be delivered to the address you gave.' : 'Collect it at ' . (string)$o['centre'] . '.';
    // email_template() escapes `intro` itself; the table below is HTML and escapes its own values.
    [$subject, $intro] = match ($what) {
        'paid' => ['Your NGG shop order ' . $o['orderId'], 'Thank you, ' . $first . '. Your order is paid. We will tell you when it is ready. ' . $where],
        'ready' => ['Your NGG order ' . $o['orderId'] . ' is ready', (string)$o['fulfil'] === 'deliver' ? 'Your order is on its way to you.' : 'Your order is ready to collect at ' . (string)$o['centre'] . '. Bring the order number: ' . (string)$o['orderId'] . '.'],
        'cancelled' => ['Your NGG order ' . $o['orderId'] . ' was cancelled', 'Your order was cancelled.' . ((string)$o['paidAt'] !== '' ? ' Your payment will be refunded; we will contact you about it.' : '')],
        default => ['', ''],
    };
    if ($subject === '') return;
    // The lines table carries no inline styles (owner's rule for email bodies): plain table attributes only.
    $rows = implode('', array_map(static fn($l) => '<tr><td>' . esc_html($l['name'] . ((string)$l['option'] !== '' ? ' (' . $l['option'] . ')' : '')) . ' × ' . (int)$l['qty'] . '</td><td align="right">₦' . number_format((int)$l['amount']) . '</td></tr>', shop_lines($o)));
    @send_mail((string)$o['email'], $subject, email_template(['title' => $subject, 'intro' => $intro,
        'bodyHtml' => '<table role="presentation" width="100%" cellpadding="4" cellspacing="0" border="0">' . $rows . '<tr><td><b>Total</b></td><td align="right"><b>₦' . number_format((int)$o['total'] + (int)$o['processingFee']) . '</b></td></tr></table>',
        'ctaUrl' => shop_order_url($o), 'ctaLabel' => 'See your order']));
}

/* ── Staff: the catalogue (content) ──────────────────────────────────────── */

function admin_shop_products(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM shop_products ORDER BY sort, name LIMIT 500');
    // Sold counts, from paid-or-later orders, in one read.
    $sold = [];
    foreach (db_all("SELECT items FROM shop_orders WHERE status IN ('paid','ready','completed') ORDER BY id DESC LIMIT 5000") as $o)
        foreach ((json_decode((string)$o['items'], true) ?: []) as $l) $sold[(string)$l['productId']] = ($sold[(string)$l['productId']] ?? 0) + (int)$l['qty'];
    return ['ok' => true, 'categories' => SHOP_CATEGORIES, 'statuses' => SHOP_PRODUCT_STATUSES,
        // The bounds the save enforces, so the Control Room states them rather than typing them in.
        'bounds' => ['priceMax' => SHOP_PRICE_MAX, 'optionsMax' => SHOP_OPTIONS_MAX, 'stockMax' => SHOP_STOCK_MAX], 'products' => array_map(static fn($r) => shop_product_public($r) + ['status' => (string)$r['status'],
        'sort' => (int)$r['sort'], 'sold' => $sold[(string)$r['productId']] ?? 0, 'updatedAt' => (string)$r['updatedAt']], $rows)];
}
function shop_slug(string $name, string $except = ''): string {
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-') ?: 'item'; $slug = $base; $n = 2;
    while (db_row('SELECT 1 FROM shop_products WHERE slug = ? AND productId <> ? LIMIT 1', [$slug, $except])) $slug = $base . '-' . $n++;
    return $slug;
}
/** admin.shop.product.save — the whole product validated before anything is written. */
function admin_shop_product_save(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $id = trim((string)($d['productId'] ?? ''));
    $cur = $id !== '' ? shop_product($id) : null;
    if ($id !== '' && !$cur) return ['ok' => false, 'error' => 'not_found'];
    $name = trim(preg_replace('/\s+/', ' ', (string)($d['name'] ?? '')));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 80) return ['ok' => false, 'error' => 'bad_name', 'detail' => 'A name of 2 to 80 characters.'];
    $cat = (string)($d['category'] ?? 'Other'); if (!in_array($cat, SHOP_CATEGORIES, true)) return ['ok' => false, 'error' => 'bad_category'];
    $price = (int)($d['price'] ?? -1); if ($price < 0 || $price > SHOP_PRICE_MAX) return ['ok' => false, 'error' => 'bad_price', 'detail' => 'A price from ₦0 to ₦' . number_format(SHOP_PRICE_MAX) . '.'];
    $desc = trim(mb_substr((string)($d['description'] ?? ''), 0, 2000));
    $img = trim((string)($d['imageUrl'] ?? ''));
    if ($img !== '' && !preg_match('#^(https://|/)[^\s"<>]+$#', $img)) return ['ok' => false, 'error' => 'bad_image', 'detail' => 'An https:// address or a path on this site.'];
    $opts = [];
    foreach ((array)($d['options'] ?? []) as $o) { $o = trim(mb_substr((string)$o, 0, 20)); if ($o !== '' && !in_array($o, $opts, true)) $opts[] = $o; }
    if (count($opts) > SHOP_OPTIONS_MAX) return ['ok' => false, 'error' => 'too_many_options', 'detail' => 'At most ' . SHOP_OPTIONS_MAX . ' options.'];
    $status = (string)($d['status'] ?? ($cur['status'] ?? 'draft')); if (!in_array($status, SHOP_PRODUCT_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    if ($status === 'live' && $price <= 0) return ['ok' => false, 'error' => 'no_price', 'detail' => 'Set a price before putting it on sale.'];
    // Stock: `null`/absent = no limit; otherwise a count per option (or one count for a product with no options).
    $stockJson = '';
    if (array_key_exists('stock', $d) && $d['stock'] !== null && $d['stock'] !== '') {
        $in = (array)$d['stock']; $st = [];
        foreach ($opts ?: [''] as $o) { $n = (int)($in[$o] ?? 0); if ($n < 0 || $n > SHOP_STOCK_MAX) return ['ok' => false, 'error' => 'bad_stock']; $st[$o] = $n; }
        $stockJson = json_encode($st, JSON_UNESCAPED_UNICODE);
    }
    $row = ['name' => $name, 'category' => $cat, 'price' => $price, 'description' => $desc, 'imageUrl' => $img, 'options' => json_encode($opts, JSON_UNESCAPED_UNICODE),
        'stock' => $stockJson, 'status' => $status, 'sort' => max(0, min(9999, (int)($d['sort'] ?? ($cur['sort'] ?? 100)))), 'updatedAt' => now_iso(), 'updatedBy' => (string)$g['requester']['memberId']];
    if ($cur) { $row['slug'] = shop_slug($name, $id); db_update('shop_products', $row, ['productId' => $id]); }
    else { $id = 'PRD-' . strtoupper(rand_hex(4)); db_insert('shop_products', $row + ['productId' => $id, 'slug' => shop_slug($name), 'createdAt' => now_iso()]); }
    audit('admin.shop.product.save', $g['requester']['memberId'], $id, ['name' => $name, 'price' => $price, 'status' => $status, 'new' => !$cur], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'productId' => $id, 'product' => shop_product_public(shop_product($id)) + ['status' => $status]];
}

/* ── Staff: orders and settings (fees) ───────────────────────────────────── */

/** The orders a fees holder may act on: all, or — scoped — collections at their centres (deliveries are head office's). */
function shop_order_in_scope(array $g, array $o): bool {
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope === null) return true;
    return (string)$o['fulfil'] === 'collect' && in_array(mb_strtolower((string)$o['centre']), array_map('mb_strtolower', $scope), true);
}
function admin_shop_orders(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $where = []; $args = [];
    $st = (string)($p['status'] ?? '');
    if ($st === 'open') $where[] = "status IN ('paid','ready')";
    elseif (in_array($st, SHOP_ORDER_STATUSES, true)) { $where[] = 'status = ?'; $args[] = $st; }
    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') { $where[] = '(lower(orderId) LIKE ? OR lower(buyerName) LIKE ? OR lower(email) LIKE ?)'; $like = '%' . mb_strtolower($q) . '%'; array_push($args, $like, $like, $like); }
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'orders' => [], 'counts' => [], 'scoped' => true];
        $where[] = "fulfil = 'collect' AND centre IN (" . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    $rows = db_all('SELECT * FROM shop_orders' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT ' . SHOP_LIST_MAX, $args);
    $counts = [];
    foreach (db_all('SELECT status, COUNT(*) c FROM shop_orders' . ($scope !== null ? " WHERE fulfil = 'collect' AND centre IN (" . implode(',', array_fill(0, count($scope), '?')) . ')' : '') . ' GROUP BY status', $scope ?? []) as $c)
        $counts[(string)$c['status']] = (int)$c['c'];
    return ['ok' => true, 'counts' => $counts, 'max' => SHOP_LIST_MAX, 'orders' => array_map(static fn($o) => shop_order_public($o) + ['email' => (string)$o['email'], 'phone' => (string)$o['phone'],
        'address' => (string)$o['address'], 'createdAt' => (string)$o['createdAt'], 'adminNote' => (string)$o['note'], 'reference' => (string)$o['paystackRef']], $rows)];
}
/**
 * admin.shop.order.set — one step of an order's life: ready (packed / on its way), completed (handed over),
 * cancel (with a reason; a paid order's stock goes back and the buyer is told a refund follows). Steps only
 * go forward; anything else is refused by name.
 */
const SHOP_ORDER_STEPS = ['ready' => ['paid'], 'completed' => ['ready', 'paid'], 'cancelled' => ['pending', 'paid', 'ready']];
function admin_shop_order_set(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $o = shop_order_by('orderId', (string)($p['orderId'] ?? ''));
    if (!$o) return ['ok' => false, 'error' => 'not_found'];
    if (!shop_order_in_scope($g, $o)) return ['ok' => false, 'error' => 'out_of_scope'];
    $to = (string)($p['status'] ?? '');
    if (!isset(SHOP_ORDER_STEPS[$to])) return ['ok' => false, 'error' => 'bad_status'];
    if ((string)$o['status'] === $to) return ['ok' => true, 'unchanged' => true];
    if (!in_array((string)$o['status'], SHOP_ORDER_STEPS[$to], true)) return ['ok' => false, 'error' => 'bad_step', 'detail' => 'A ' . $o['status'] . ' order cannot be marked ' . $to . '.'];
    $reason = trim(mb_substr((string)($p['reason'] ?? ''), 0, 300));
    if ($to === 'cancelled' && (string)$o['status'] !== 'pending' && mb_strlen($reason) < 5) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why a paid order is cancelled; the refund follows from it.'];
    $set = ['status' => $to, 'updatedAt' => now_iso()];
    if ($to === 'ready') $set['readyAt'] = now_iso();
    if ($to === 'completed') $set['completedAt'] = now_iso();
    if ($to === 'cancelled') $set['note'] = trim(((string)$o['note'] !== '' ? $o['note'] . ' ' : '') . 'Cancelled: ' . ($reason !== '' ? $reason : 'not paid') . '.' . ((string)$o['paidAt'] !== '' ? ' Refund due.' : ''));
    $won = db_exec('UPDATE shop_orders SET ' . implode(', ', array_map(static fn($k) => "$k = ?", array_keys($set))) . ' WHERE orderId = ? AND status = ?',
        array_merge(array_values($set), [(string)$o['orderId'], (string)$o['status']]));
    if (!$won) return ['ok' => false, 'error' => 'changed', 'detail' => 'The order changed while you were looking. Reload it.'];
    if ($to === 'cancelled' && (string)$o['paidAt'] !== '') shop_stock_take($o, +1);
    $o = shop_order_by('orderId', (string)$o['orderId']);
    if ($to !== 'completed' && ($to !== 'cancelled' || (string)$o['paidAt'] !== '')) shop_mail_buyer($o, $to);
    audit('admin.shop.order', $g['requester']['memberId'], (string)$o['orderId'], ['to' => $to, 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'order' => shop_order_public($o)];
}
function admin_shop_settings(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => shop_settings(), 'paystack' => paystack_secret() !== '', 'centres' => shop_collection_centres(),
        'bounds' => ['deliveryFeeMax' => SHOP_DELIVERY_FEE_MAX]];
}
function admin_shop_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : []; $cur = shop_settings(); $new = $cur;
    if (array_key_exists('enabled', $d)) $new['enabled'] = !empty($d['enabled']);
    if (array_key_exists('deliveryOn', $d)) $new['deliveryOn'] = !empty($d['deliveryOn']);
    if (array_key_exists('deliveryFee', $d)) { $f = (int)$d['deliveryFee']; if ($f < 0 || $f > SHOP_DELIVERY_FEE_MAX) return ['ok' => false, 'error' => 'bad_fee']; $new['deliveryFee'] = $f; }
    foreach (['collectNote', 'deliveryNote'] as $k) if (array_key_exists($k, $d)) $new[$k] = trim(mb_substr((string)$d[$k], 0, 300));
    if ($new['enabled'] && !db_row("SELECT 1 FROM shop_products WHERE status = 'live' LIMIT 1")) return ['ok' => false, 'error' => 'nothing_live', 'detail' => 'Put at least one product on sale before opening the shop.'];
    setting_set('shop', $new, (string)$g['requester']['memberId']);
    audit('admin.shop.settings', $g['requester']['memberId'], 'shop', ['from' => $cur, 'to' => $new], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'settings' => shop_settings()];
}
