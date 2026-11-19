<?php
/** Public: the NGG shop — the catalogue, a priced cart, placing an order (Paystack), and an order by its private link. */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('shop');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $tok = (string)($_GET['token'] ?? '');
    $res = $tok !== '' ? gs_call('public.shop.order.get', ['token' => $tok, 'reference' => (string)($_GET['reference'] ?? '')])
                       : gs_call('public.shop.list', []);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $act = (string)($b['action'] ?? '');
    $res = $act === 'pay' ? gs_call('public.shop.order.pay', ['token' => (string)($b['token'] ?? ''), 'ip' => client_ip()])
        : gs_call($act === 'order' ? 'public.shop.order' : 'public.shop.quote', ['items' => is_array($b['items'] ?? null) ? $b['items'] : [], 'fulfil' => (string)($b['fulfil'] ?? 'collect'),
        'buyer' => is_array($b['buyer'] ?? null) ? $b['buyer'] : [], 'centre' => (string)($b['centre'] ?? ''), 'address' => (string)($b['address'] ?? ''),
        'code' => (string)($b['code'] ?? ''), 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), ($res['error'] ?? '') === 'not_found' ? 404 : 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
