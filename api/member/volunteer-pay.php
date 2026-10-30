<?php
/** A member's own volunteer wallet, when they are an NGG volunteer: what they
 *  have earned, each day and why, what has been paid and what fines it took
 *  (domain/volunteer-pay.php). POST {action:'bank', bankName, accountNumber,
 *  accountName} sets where they are paid; they are told of every change. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'bank') json_error('unknown_action', 400);
    rate_limit_check_actor('volpay.bank', (string)$s['mid']);
    $res = gs_call('member.volpay.bank', ['memberId' => $s['mid'], 'bankName' => (string)($b['bankName'] ?? ''),
        'accountNumber' => (string)($b['accountNumber'] ?? ''), 'accountName' => (string)($b['accountName'] ?? '')]);
} else {
    $res = gs_call('member.volpay', ['memberId' => $s['mid']]);
}
if (empty($res['ok'])) { http_response_code(str_starts_with((string)($res['error'] ?? ''), 'bad_') ? 422 : 400); echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
unset($res['ok']); json_ok($res);
