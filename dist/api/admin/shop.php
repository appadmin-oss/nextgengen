<?php
/**
 * Admin: the NGG shop. The catalogue and stock are `content`; orders, refunds, table sales, cash sessions, codes,
 * reports and settings are `fees` (domain/shop.php, domain/shop-manage.php). The domain decides who may.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$who = ['requesterId' => $s['mid'], 'ip' => client_ip()];
$g = static fn(string $k) => (string)($_GET[$k] ?? '');
if ($method === 'GET') {
    $what = $g('what') ?: 'orders';
    $res = match ($what) {
        'products' => gs_call('admin.shop.products', $who),
        'settings' => gs_call('admin.shop.settings', $who),
        'order' => gs_call('admin.shop.order.get', $who + ['orderId' => $g('orderId')]),
        'stock' => gs_call('admin.shop.stock', $who),
        'history' => gs_call('admin.shop.stock.history', $who + ['productId' => $g('productId'), 'variant' => isset($_GET['variant']) ? $g('variant') : null]),
        'codes' => gs_call('admin.shop.codes', $who),
        'pos' => gs_call('admin.shop.pos', $who),
        'sessions' => gs_call('admin.shop.pos.sessions', $who + ['sessionId' => $g('sessionId')]),
        'report' => gs_call('admin.shop.report', $who + ['from' => $g('from'), 'to' => $g('to'), 'productId' => $g('productId')]),
        'export' => gs_call('admin.shop.orders.export', $who + ['status' => $g('status'), 'q' => $g('q'), 'from' => $g('from'), 'to' => $g('to'), 'channel' => $g('channel')]),
        default => gs_call('admin.shop.orders', $who + ['status' => $g('status'), 'q' => $g('q'), 'from' => $g('from'), 'to' => $g('to'), 'channel' => $g('channel'),
            'sort' => $g('sort'), 'page' => isset($_GET['page']) ? $g('page') : null, 'pageSize' => $g('pageSize')]),
    };
} elseif ($method === 'POST') {
    $b = read_json_body();
    $arr = static fn(string $k) => is_array($b[$k] ?? null) ? $b[$k] : [];
    $str = static fn(string $k) => (string)($b[$k] ?? '');
    $res = match ($str('action')) {
        'product' => gs_call('admin.shop.product.save', $who + ['data' => $arr('data')]),
        'order' => gs_call('admin.shop.order.set', $who + ['orderId' => $str('orderId'), 'status' => $str('status'), 'reason' => $str('reason'),
            'code' => $str('code'), 'tracking' => $str('tracking'), 'refund' => $str('refund') ?: 'later']),
        'settings' => gs_call('admin.shop.settings.set', $who + ['data' => $arr('data')]),
        'note' => gs_call('admin.shop.order.note', $who + ['orderId' => $str('orderId'), 'text' => $str('text')]),
        'remind' => gs_call('admin.shop.order.remind', $who + ['orderId' => $str('orderId')]),
        'exchange' => gs_call('admin.shop.order.exchange', $who + ['orderId' => $str('orderId'), 'line' => (int)($b['line'] ?? -1), 'to' => $str('to'), 'qty' => (int)($b['qty'] ?? 0)]),
        'refund' => gs_call('admin.shop.refund', $who + ['orderId' => $str('orderId'), 'amount' => $b['amount'] ?? null, 'method' => $str('method'), 'reason' => $str('reason'), 'restock' => $arr('restock')]),
        'refundCheck' => gs_call('admin.shop.refund.check', $who + ['refundId' => $str('refundId')]),
        'adjust' => gs_call('admin.shop.stock.adjust', $who + ['productId' => $str('productId'), 'variant' => $str('variant'), 'delta' => (int)($b['delta'] ?? 0), 'reason' => $str('reason'), 'note' => $str('note')]),
        'stocktake' => gs_call('admin.shop.stocktake', $who + ['counts' => $arr('counts'), 'note' => $str('note')]),
        'code' => gs_call('admin.shop.code.save', $who + ['data' => $arr('data')]),
        'sale' => gs_call('admin.shop.pos.sale', $who + ['items' => $arr('items'), 'method' => $str('method'), 'sessionId' => $str('sessionId'),
            'buyerName' => $str('buyerName'), 'phone' => $str('phone'), 'email' => $str('email'), 'note' => $str('note')]),
        'sessionOpen' => gs_call('admin.shop.pos.session.open', $who + ['label' => $str('label'), 'centre' => $str('centre'), 'openingFloat' => (int)($b['openingFloat'] ?? 0)]),
        'sessionClose' => gs_call('admin.shop.pos.session.close', $who + ['sessionId' => $str('sessionId'), 'counted' => $b['counted'] ?? null, 'note' => $str('note')]),
        default => ['ok' => false, 'error' => 'bad_action'],
    };
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), in_array($res['error'] ?? '', ['forbidden', 'out_of_scope'], true) ? 403 : (($res['error'] ?? '') === 'not_found' ? 404 : 400), isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
