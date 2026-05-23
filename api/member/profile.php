<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_session();
$body = read_json_body();

$res = gs_call('member.update', array_merge($body, [
    'memberId' => $s['mid'],
    'ip'       => client_ip(),
]));
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
