<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.broadcast.history', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('admin.broadcast', [
        'requesterId' => $s['mid'],
        'title'       => $body['title']    ?? '',
        'body'        => $body['body']     ?? '',
        'linkPage'    => $body['linkPage'] ?? '',
        'audience'    => $body['audience'] ?? 'all',
        'email'       => !empty($body['email']),
        'community'   => !empty($body['community']),
        'ip'          => client_ip(),
    ]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
