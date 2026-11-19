<?php
/** Public: a family's joining invoice, by its private token — read it, pay it with Paystack, confirm the payment. */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('membership.pay');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('public.membership.invoice', ['token' => (string)($_GET['token'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $op = (string)($b['action'] ?? '') === 'verify' ? 'public.membership.pay.verify' : 'public.membership.pay.init';
    $res = gs_call($op, ['token' => (string)($b['token'] ?? ''), 'reference' => (string)($b['reference'] ?? ''), 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
// `detail` carries a refusal's one useful fact — for balance_changed, the link to today's amount.
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), ($res['error'] ?? '') === 'not_found' ? 404 : 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
