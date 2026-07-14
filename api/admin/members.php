<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.members.list', [
        'requesterId' => $s['mid'],
        'q'      => $_GET['q']      ?? '',
        'centre' => $_GET['centre'] ?? '',
        'status' => $_GET['status'] ?? '',
        'type'   => $_GET['type']   ?? '',
        'ip'     => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $action = (string)($body['action'] ?? '');
    if ($action === 'reset2fa') {
        $res = gs_call('admin.members.reset2fa', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'resetPassword') {
        $res = gs_call('admin.members.resetPassword', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.members.upsert', ['requesterId' => $s['mid'], 'data' => $body, 'ip' => client_ip()]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
