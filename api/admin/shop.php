<?php
/** Admin: the NGG shop — the catalogue (content), orders and settings (fees). The domain decides who may. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$who = ['requesterId' => $s['mid'], 'ip' => client_ip()];
if ($method === 'GET') {
    $what = (string)($_GET['what'] ?? 'orders');
    $res = $what === 'products' ? gs_call('admin.shop.products', $who)
        : ($what === 'settings' ? gs_call('admin.shop.settings', $who)
        : gs_call('admin.shop.orders', $who + ['status' => (string)($_GET['status'] ?? ''), 'q' => (string)($_GET['q'] ?? '')]));
} elseif ($method === 'POST') {
    $b = read_json_body();
    $act = (string)($b['action'] ?? '');
    $res = match ($act) {
        'product' => gs_call('admin.shop.product.save', $who + ['data' => is_array($b['data'] ?? null) ? $b['data'] : []]),
        'order' => gs_call('admin.shop.order.set', $who + ['orderId' => (string)($b['orderId'] ?? ''), 'status' => (string)($b['status'] ?? ''), 'reason' => (string)($b['reason'] ?? '')]),
        'settings' => gs_call('admin.shop.settings.set', $who + ['data' => is_array($b['data'] ?? null) ? $b['data'] : []]),
        default => ['ok' => false, 'error' => 'bad_action'],
    };
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), in_array($res['error'] ?? '', ['forbidden', 'out_of_scope'], true) ? 403 : 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
