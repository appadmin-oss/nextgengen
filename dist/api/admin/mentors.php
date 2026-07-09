<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.mentors.list', ['requesterId' => $s['mid']]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}
if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('admin.mentors.upsert', [
        'requesterId' => $s['mid'],
        'data'        => $body,
        'ip'          => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}
json_error('method_not_allowed', 405);
