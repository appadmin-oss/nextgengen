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
    /* `action`: read (the default — one, or `all`, or back to unread with
       `unread`) or dismiss (with `undo` to bring it back). */
    $op = ($body['action'] ?? '') === 'dismiss' ? 'member.notificationDismiss' : 'member.notificationRead';
    $res = gs_call($op, [
        'memberId' => $s['mid'],
        'notifId'  => $body['notifId'] ?? '',
        'all'      => !empty($body['all']),
        'unread'   => !empty($body['unread']),
        'undo'     => !empty($body['undo']),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
