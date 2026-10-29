<?php
/** Member: ask to change my photo (with the new one), see the ask, withdraw it.
 *  The desk decides in the Control Room inbox (domain/photos.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('member.photo.change.mine', ['memberId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = (string)($b['action'] ?? '') === 'withdraw'
        ? gs_call('member.photo.change.withdraw', ['memberId' => $s['mid'], 'ip' => client_ip()])
        : gs_call('member.photo.change', ['memberId' => $s['mid'], 'ip' => client_ip(), 'photoUrl' => $b['photoUrl'] ?? '', 'reason' => $b['reason'] ?? '']);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
