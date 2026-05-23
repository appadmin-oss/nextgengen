<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('POST');
$body = read_json_body();
$res = gs_call('admin.broadcast', [
    'requesterId' => $s['mid'],
    'title'       => $body['title']    ?? '',
    'body'        => $body['body']     ?? '',
    'linkPage'    => $body['linkPage'] ?? '',
    'ip'          => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
