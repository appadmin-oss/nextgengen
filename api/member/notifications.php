<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.notifications', ['memberId' => $s['mid']]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('member.notificationRead', [
        'memberId' => $s['mid'],
        'notifId'  => $body['notifId'] ?? '',
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
