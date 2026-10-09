<?php
/** Set or change the signed-in member's password. Authenticated + CSRF. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_member_session();

$body = read_json_body();
$res = gs_call('auth.setPassword', [
    'memberId' => $s['mid'],
    'password' => (string)($body['password'] ?? ''),
    'current'  => (string)($body['current'] ?? ''),
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
