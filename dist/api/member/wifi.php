<?php
/** A member's own Wi-Fi: their sign-in name, PIN, and whether (and why) they
 *  have access. POST {action:'reset'} gives them a new PIN, at most three a day. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'reset') json_error('unknown_action', 400);
    rate_limit_check_actor('wifi.pin', (string)$s['mid']);
    $res = gs_call('member.wifi.reset', ['memberId' => $s['mid'], 'ip' => client_ip()]);
} else {
    $res = gs_call('member.wifi.get', ['memberId' => $s['mid']]);
}
if (empty($res['ok'])) {
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
