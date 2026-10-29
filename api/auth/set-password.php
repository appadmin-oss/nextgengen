<?php
/** Set or change the signed-in member's password. Authenticated + CSRF. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_member_session();
// Per member and address, on top of the per-account guess guard in auth_set_password().
rate_limit_check('auth.setPassword', (string)$s['mid']);

$body = read_json_body();
$res = gs_call('auth.setPassword', [
    'memberId' => $s['mid'],
    'password' => (string)($body['password'] ?? ''),
    'current'  => (string)($body['current'] ?? ''),
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'too_many_attempts' ? 429 : 400);
unset($res['ok']);
json_ok($res);
