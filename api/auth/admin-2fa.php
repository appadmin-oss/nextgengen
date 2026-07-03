<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('auth.verify');

$s = session_read();
if (!$s) json_error('unauthorized', 401);
$role = strtolower((string)($s['role'] ?? ''));
if ($role !== 'admin' && $role !== 'super_admin') json_error('forbidden', 403);

$body = read_json_body();
$code = trim((string)($body['code'] ?? ''));
if ($code === '') json_error('missing_code');

$res = gs_call('auth.totpVerify', [
    'memberId' => $s['mid'] ?? '',
    'code'     => $code,
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'invalid_code', 401);

session_issue([
    'memberId' => $s['mid'],
    'role'     => $s['role'],
    'type'     => $s['type'] ?? '',
    'status'   => $s['status'] ?? '',
], true);
json_ok([]);
