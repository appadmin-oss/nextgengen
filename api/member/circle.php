<?php
/** Member (student) side of Anchor Circle — invite code + link management. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.circle', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'rotate')      $res = gs_call('member.circle.rotate', ['requesterId' => $mid, 'ip' => client_ip()]);
    elseif ($action === 'revoke')  $res = gs_call('member.circle.revoke', ['requesterId' => $mid, 'linkId' => $b['linkId'] ?? '', 'ip' => client_ip()]);
    else                           json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
