<?php
/** A member's own Wi-Fi: their sign-in name, whether a password is set, and
 *  whether (and why) they have access. POST {action:'password', password}
 *  sets the password they chose, at most three changes a day. It is never
 *  sent back. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'password') json_error('unknown_action', 400);
    rate_limit_check_actor('wifi.pin', (string)$s['mid']);
    $res = gs_call('member.wifi.password', ['memberId' => $s['mid'], 'password' => (string)($b['password'] ?? ''), 'ip' => client_ip()]);
} else {
    $res = gs_call('member.wifi.get', ['memberId' => $s['mid']]);
}
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'weak_password' ? 422 : (($res['error'] ?? '') === 'too_many_resets' ? 429 : 400));
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
